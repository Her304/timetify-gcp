# AI-agent bridge (MCP server)

`backend/main/mcp/` — a generic remote MCP server over the calling user's own data. Opt-in, reachable only from the "connect an ai agent" card in Settings. Any MCP client works (Hermes, Claude Code, a script); nothing is Hermes-specific.

Two ways in, one authorization model: a **personal access token** pasted into a config file, or **OAuth 2.1 sign-in** for clients that take a URL and run the handshake themselves (claude.ai, ChatGPT). Both resolve to the same `Principal` in `mcp/auth.py`, and nothing above that layer knows which was used.

## Transport

- Single endpoint `POST /mcp/v1/`, stateless JSON-RPC. **No SSE, no session id.** Prod is `gunicorn --workers 2 --threads 2` = 4 concurrent requests app-wide; a long-lived stream per agent would starve the app. `GET` returns 405 (the spec's "no server-initiated stream").
- Registered at **both** `mcp/v1/` and `mcp/v1` because `APPEND_SLASH=False` — the slashless form would otherwise hard-404 with no redirect.
- No `mcp` SDK dependency: it's asyncio/Starlette-shaped and this is sync WSGI. `protocol.py` hand-rolls `initialize` / `notifications/*` / `ping` / `tools/list` / `tools/call`, so a spec bump is a patch, not a dep upgrade.
- JSON-RPC batching was dropped in the 2025-06-18 revision but arrays are still accepted for older clients.

## Auth

- `Authorization: Bearer ttfy_agent_<random>`. Only the **sha256** is stored (`AgentAccessToken.token_hash`) — unsalted on purpose, because the hash *is* the lookup key. Raw value is returned once by `POST /api/agent-tokens/` and is unrecoverable after.
- **`McpEndpointView` sets `authentication_classes = []`.** Without it the project-default `JWTAuthentication` tries to decode the PAT and raises before the view runs — every request 401s with a confusing JWT error. It also enforces the isolation: a session JWT is rejected at `/mcp/v1/`, and an agent token is rejected everywhere else. Both directions are tested.
- Revocation is a column write re-checked on every request — no cache window.
- A deactivated (`is_active=False`) user's token stops working too.
- `AgentCredential` is an abstract base holding revocation + rate-limit state; both `AgentAccessToken` (PAT) and `OAuthAccessToken` inherit it, so revocation, rate limiting and `last_used_at` behave identically for either.
- `resolve_credential()` dispatches on **prefix** (`ttfy_agent_` → PAT, `ttfy_oat_` → OAuth) rather than trying each resolver in turn, so the two credential systems stay unambiguous.

## OAuth 2.1 (`mcp/oauth.py`)

Timetify is both authorization server and resource server — the simple shape for a single first-party API, and it avoids standing up an IdP when Django already owns the accounts.

| Path | What |
|---|---|
| `/.well-known/oauth-protected-resource` | RFC 9728. The `WWW-Authenticate` on the 401 from `/mcp/v1/` points here; this points at the auth server. That chain is the whole bootstrap — without it a web connector cannot discover the flow. |
| `/.well-known/oauth-authorization-server` | RFC 8414. Advertises `S256` **only**. |
| `POST /oauth/register` | RFC 7591 dynamic client registration. Not optional: clients like Claude have no pre-arranged `client_id`. Anyone can register, so it's rate-limited (20/hour globally) — a `client_id` alone grants nothing until a user completes consent. |
| `GET/POST /oauth/authorize` | Login + consent, rendered by **Django templates** (`backend/templates/oauth/`), not the SPA. The SPA authenticates with a JWT in localStorage on a different origin; bouncing through it would move credentials across origins for no benefit. |
| `POST /oauth/token` | `authorization_code` + `refresh_token` grants. |
| `POST /oauth/revoke` | RFC 7009. Always 200 — answering "unknown token" would make it an oracle. |

Two things that unit tests could not catch, both found by running a real client against a live server — check them before trusting a green suite here:

- **`/oauth/register`, `/oauth/token` and `/oauth/revoke` are `@csrf_exempt`.** They are called by an MCP client's HTTP stack, which has no cookie and no CSRF token, so `CsrfViewMiddleware` answered **403 to the very first request of the flow** — with all tests passing, because Django's test client disables CSRF enforcement by default. Nothing is weakened: CSRF defends cookie-authenticated requests, and these authenticate with credentials a browser never attaches on its own (PKCE verifier, client_secret, or the token being revoked). `/oauth/authorize` is the one browser form and keeps `@csrf_protect`. `CsrfTests` uses `Client(enforce_csrf_checks=True)` and covers both directions.
- **`_issuer()` follows the request in DEBUG.** It was unconditionally the canonical domain, so a dev server on `127.0.0.1:8000` told every client its authorization server was `https://timetify.net` — the handshake left the machine and the flow could not be run locally at all. Production stays pinned to `CANONICAL_DOMAIN` regardless of the Host header; only DEBUG derives it from the request.

Security posture, all tested in `test_agent_oauth.py`:

- **PKCE S256 required.** `plain` and a missing challenge are both rejected; there are no legacy non-PKCE clients to stay compatible with.
- **`redirect_uri` must match a registration exactly.** No prefix matching — that's the classic route to an open redirect and, through it, code theft. Parameter errors before that check render a page instead of redirecting, because there's no destination we can safely send a browser to yet.
- **Codes are single-use, 60s, and bound to client + redirect_uri + challenge**, all re-checked at redemption. A replay revokes *every* live token from that grant, not just the second exchange — a replayed code means the code leaked.
- **Refresh tokens rotate on every use**, so reuse of an old one fails instead of working forever.
- Only sha256 of access/refresh tokens is stored, same reasoning as the PAT.
- Registration accepts `https` anywhere, `http` on **loopback only** (MCP clients commonly catch the redirect on 127.0.0.1), and RFC 8252 private-use schemes. `javascript:` / `data:` / `file:` and friends are denied outright — they aren't destinations, and nothing legitimate registers one.
- **`resource` (RFC 8707) is recorded, not enforced.** There is exactly one resource, so there's nothing to check against; if a second is ever added, the audience check goes in `_resolve_oauth` *before* that resource exists.

**The server-rendered pages** (`backend/templates/base.html` + `oauth/*.html`, shared with the email-change result) carry **no third-party resources**. They used to pull Tailwind from `cdn.tailwindcss.com` and CSS from Google Fonts — an executable script from another origin on the one page in the product where users type their password. The replacement is a hand-written stylesheet in `base.html` plus `/fonts/fonts.css`, which nginx serves from the SPA build on the same origin. Three constraints worth knowing before editing these:

- **Every selector is scoped under `.tf` on `<body>`.** A browser extension's injected stylesheet can define bare class names — one defines `.dot` as a 3px white absolutely-positioned circle, which silently blanked the consent screen's scope bullets. `.tf .x` outranks any single-class rule an extension can inject, whatever the cascade order.
- **Multi-line `{# … #}` does not work.** Django's comment tag is single-line; a wrapped one renders into the page (it did, at the top of every page, and inside `login.html`'s form). Use `{% comment %}` for anything longer than a line.
- **The CSP deliberately omits `form-action`.** Approving consent POSTs and is answered with a 302 to the client's redirect_uri, and browsers have disagreed about whether `form-action` covers the redirect following a form submission. Everything else is locked to `'none'`/`'self'`; there is no script on these pages at all.

**Connected apps UI:** `GET /api/agent-connections/` lists grants **grouped by client**, not per token — refresh rotation mints a row per refresh, so one connection is a stream of rows and listing them would make a single app look like dozens. Scopes shown are the union across live grants (re-consenting leaves the older grant alive). `DELETE /api/agent-connections/<client_id>/` revokes every live token for that user/client pair *and* consumes unredeemed authorization codes — otherwise a code issued seconds earlier, or a refresh in flight, would quietly undo the disconnect.

`purge_expired()` (spent codes >1d, tokens >7d past refresh expiry) runs from `run_moderation_tick()` — the only thing already on a schedule. It's wrapped in its own try/except so a cleanup failure can't discard the moderation work in the same pass.

## The public address is proxied, not direct

`timetify.net` is nginx serving the static SPA; Django is a **separate** Cloud Run service, and `VITE_API_URL` points at the raw `*.run.app` hostname. So `frontend/nginx.conf.template` proxies `^/mcp/v1/?$` through to `${BACKEND_HOST}` (same pattern as `/sitemap.xml`), and the Settings card hardcodes `https://timetify.net/mcp/v1/` in prod rather than deriving it from `VITE_API_URL`.

That URL gets copied into config files we don't control, so it has to survive the backend service being renamed or moved — same reasoning as `CANONICAL_DOMAIN`. **Changing the nginx block needs a frontend redeploy**, since that's where nginx lives.

**A push to `main` does not ship the nginx block.** `cloudbuild.yaml` builds and deploys `./backend` only, so the Django half goes out on its own and the frontend image — which is where `/mcp/v1/` and the `/oauth/` proxy rules live — needs its own deploy. A half-deploy is quiet rather than loud: nginx has no matching `location`, so the request falls through to the SPA and the client gets **`200` with HTML** instead of JSON-RPC. Verify the whole chain after any deploy that touches either side:

```
curl -s -i -X POST https://timetify.net/mcp/v1/ -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Correct answer is `401` with `content-type: application/json`, `{"error": "invalid_token"}`, and a `WWW-Authenticate` header naming the resource metadata. HTML in the body means the frontend didn't deploy; a `500` mentioning a missing relation means the migrations didn't run.

## Connecting a hosted client

`127.0.0.1:8000` cannot be used with a hosted agent (claude.ai, ChatGPT, Codex). Loopback resolves on *their* infrastructure, so the request never reaches the developer's machine and the client reports the server as down — accurately, from where it is standing. This costs an hour every time it is rediscovered. Use `https://timetify.net/mcp/v1/`, or a tunnel (`cloudflared tunnel --url http://localhost:8000`) with the tunnel hostname added to `ALLOWED_HOSTS` when testing unreleased changes.

Timetify is **not in any connector registry**, and does not need to be — registries carry curated one-click connectors; everything else is added as a *custom connector by URL* in the client's own settings. Clients frequently misreport this as "not found in the registry, therefore cannot be added". Relatedly, an assistant cannot attach a connector from inside a conversation: it is a settings-level action requiring the account holder's consent, which is what stops page content from talking an agent into wiring an MCP server to someone's account. Every discovery document a client needs to self-register is already served (`WWW-Authenticate` → resource metadata → auth-server metadata → DCR), so the URL alone is sufficient wherever custom connectors are supported at all.

`claude mcp add --transport http timetify https://timetify.net/mcp/v1/` is the fastest way to exercise the real flow — no registry, no plan gate.

## Local dev writes to the production database

`.env` sets `DB_PORT=5433`, which is the Cloud SQL Auth Proxy (`./cloud-sql-proxy --port 5433 timetify-prod:us-central1:timetify-gcp-v2`), so **`manage.py runserver` on a laptop reads and writes production data.** The Homebrew Postgres on `5432` is not used by the app. Consequences worth internalising before running anything:

- A token minted against `127.0.0.1:8000` is **live on the public endpoint immediately** — dev tokens are production credentials, and leaking one is a real leak.
- `manage.py migrate` from a laptop migrates production. `0032` / `0033` were applied this way; they must be applied **before** the backend deploy or every `/api/agent-tokens/` request 500s on `relation "main_agentaccesstoken" does not exist`.
- Sentry events from a dev server are real events. They are labelled by `SENTRY_ENVIRONMENT`, defaulting from `DEBUG` — before that existed, every laptop 500 was filed as production.
- Point the test suite somewhere else: `DB_PORT=5432 DB_USER=<local role> DB_PASS= manage.py test` runs against local Postgres instead of creating a `test_timetify_db` on the production instance.

## Scopes

`mcp/scopes.py` is the single vocabulary — the mint UI, the OAuth consent screen and the resource check all read the same strings. `VALID` is a **closed set**: an unrecognised scope grants *nothing*, never everything — a tampered `scopes` JSON fails closed. Write scopes are never pre-checked in the mint UI.

`schedule:read` · `availability:read` · `unread:read` · `friends:read` · `schedule:write` · `events:write`

Scopes are editable on a live **PAT** (`PATCH /api/agent-tokens/<pk>/`) — the raw token is untouched, only its reach changes, effective on the next request. Narrowing is the case that matters: if tightening access meant re-pasting a new token into a config file, nobody would bother. Revoke (`DELETE`) is a soft delete: the row disappears from the user's list and stops working immediately, but is retained (hash + timestamps only) so `agent_token_created` still counts every token ever minted.

OAuth grants are **not** editable in place — scopes are fixed at consent, and changing them means disconnecting and reconnecting so the client re-asks. Editing them behind the client's back would leave it believing it holds scopes it doesn't.

## Tools

No tool takes a user identifier — cross-user access isn't a permission check that could be forgotten, it's not expressible.

| Tool | Notes |
|---|---|
| `get_today_schedule` | Reuses `availability._DAY_ABBR` weekday matching **through `availability.norm_day`** — see below; **excludes `CourseSkip`** rows (`get_busy_blocks` doesn't, so this filter lives in the tool). Optional `timezone` arg — see below. |
| `get_free_busy` | Mirrors `AvailabilityMeView`. Intervals only, never event titles. |
| `get_unread_count` | Mirrors `UnreadCountView` incl. `_blocked_user_ids`. Count only — no rooms, senders or previews. |
| `get_shared_free_slots` | Mirrors `SharedGapsView`. Takes **usernames**, resolved via `_visible_friend_ids` and `utils.users_by_username`. |
| `create_class` | Two-step. Narrow `AgentCourseCreateSerializer`, not `CourseSerializer`. |
| `create_event` | Two-step. Optional `invite_usernames` (friends only) and `create_chat` (default off). Public/join-requests still forced off; `source_chat_room_id` still refused. |

**`rep_date` has no single stored format, so never match it by hand.** The add-course UI (`add.jsx` joins `selectedDays`) and the syllabus parser write **full day names** — `"Monday,Wednesday"` — and that is the shape of the overwhelming majority of rows. The agent bridge's `AgentCourseCreateSerializer` writes **abbreviations** — `"MON,WED"`. Everything that compares a weekday token must go through **`availability.norm_day`** (`.strip().upper()[:3]`) or `availability.parse_rep_days`; `views._norm_day` is an alias of it.

This is not hypothetical tidiness. `get_busy_blocks` and the MCP `_courses_on` both compared with a bare `.upper()` and no truncation, so `"MONDAY" != "MON"` and **every course stored in the app's own dominant format silently never matched**. `get_today_schedule` returned an empty timetable, and free/busy — `AvailabilityMeView`, friends' availability, `SharedGapsView` — reported users as free during their own classes. The MCP suite was green throughout because every fixture in it used `rep_date='MON,WED'`, the one format the app never writes. New schedule tests must use a full day name.

`views._parse_rep_days` had the same blind spot mirrored — it normalized with `.capitalize()`, so on `CourseFinalizeView` an incoming `"MON"` did not intersect an existing `"Monday"` and a real clash was reported as conflict-free; `create_class`'s overlap preview imports the helper and inherited it. It now delegates to `parse_rep_days` as well. **Matching and display are deliberately separate jobs:** the sets hold abbrevs, and `_find_overlap_day` renders the answer through `availability.day_label` because `add.jsx:603` prints `overlapInfo.day.toLowerCase()` straight into "both meet monday" — the conflict screen's copy must not dictate how weekdays are compared. `_conflict_for_user` is the one response that emits a bare abbrev (`"day": "WED"`); that shape is already consumed that way, so it was left alone.

Both conflict paths now pick the earliest shared day via `availability.sort_days` rather than the alphabetically first, which used to report a Mon+Fri clash as "Friday". `sort_days` is total — callers index `[0]` off a set they have already checked is non-empty, so an unrecognised token sorts last instead of being dropped into an IndexError.

`test_availability.py` covers these as pure functions; no DB, so it is the cheap place to pin normalization rules.

**Timezone:** `TIME_ZONE="UTC"` and `availability.py` treats course times as UTC wall-clock. Invisible in-app, but a tool called "today's schedule" makes it visible (8pm in UTC-5 is already tomorrow UTC). Tools accept an optional IANA `timezone`; default is UTC for parity with the app. There is **no timezone field on `CustomUser`**, so the server cannot infer one — the client has to send it. The date-bearing responses echo the resolved zone back as `timezone`, because a UTC-defaulted reply naming tomorrow is otherwise indistinguishable from a correct one.

**Friend lookup is deliberately non-committal — on reads.** In `get_shared_free_slots`, unknown usernames and non-friends are both silently dropped and the response never distinguishes them. Otherwise the tool is a username-existence oracle and a friendship-status probe. Tested.

**That silence does not transfer to `create_event` invites**, where a dropped name is invisible at every later step: the user confirms an event believing someone was invited and nothing ever reaches them. `_resolve_invitees` therefore rejects the whole call and names what failed — while still giving "no such account" and "not your friend" one shared message, so the oracle stays closed. A read that quietly returns less is recoverable; a write that quietly does less is not.

**Usernames are matched case-insensitively everywhere** — `utils.canonical_username` for one name, `utils.users_by_username` for many (there is no `__iin`, so it OR-chains `iexact`; note its empty-input guard, since an empty `Q()` matches every row). Sign-up enforces case-insensitive uniqueness, so `JaeHyun` and `jaehyun` cannot both exist and a case-sensitive lookup buys nothing. This is not hypothetical: `get_shared_free_slots` matched with a bare `username__in`, so a lowercased name silently matched nobody, and — because unmatched names are dropped by design — the tool returned **the caller's own free time labelled as shared**, with nothing in the payload to signal it. The same gap existed in `mcp/oauth.py`, which called `authenticate()` on raw input while the app's own `CustomTokenObtainPairSerializer` canonicalised first, so identical credentials worked in the app and failed on the agent sign-in page. Both now route through the shared helpers.

**The `create_event` confirmation token binds resolved invitee ids, not the raw username strings.** Binding the strings would make `["JaeHyun"]` and `["jaehyun"]` different payloads and break a valid token; leaving invites out of the hash entirely would let a preview of a solo event be committed with guests attached. Both are tested.

## Writes are two-step

`mcp/confirm.py`. First call → preview + `confirmation_token`, **nothing saved**. Second call with the token commits. An agent can't create anything in one round trip, so the preview has to go back through it — and in practice, in front of the user.

MCP tool annotations (`readOnlyHint` etc.) and description text can only *ask* a client to confirm; a self-hosted agent may auto-approve and ignore both. Hence the server-side enforcement. `payload_hash` binds the token to the previewed content, so a token issued for one thing can't commit another. The same row is the idempotency record — agents retry, and without it one dropped response becomes five identical courses.

**`create_event` constraints (all forced, each a one-line flag to relax):** no invites, `create_chat=False`, `visibility=PRIVATE`, `on_conflict` defaults to `fail`. It also checks `FunctionRestriction`, which the app's own `EventListCreateView.post` does not.

**`create_class`:** `has_ai_content` stays `False` — it gates the weeks/exams/assignments panels in `class.jsx`, and an agent-created course has none. `sections[]` children are parented to the row created in the same request, never to a caller-supplied id. Agents parse syllabus PDFs themselves; `pdf.py` is not involved and the agent path spends no OpenAI budget.

## Rate limiting

On the credential row, not in a cache — **no `CACHES` is configured**, so Django would fall back to per-process LocMemCache and count roughly 1/(workers × instances) of real traffic. Fixed 60s windows: 60 reads/min, 10 writes/min (a write consumes both budgets). `last_used_at` is written at most once a minute.

## Metrics

No analytics pipeline. `agent_token_created` = row count on the `AgentAccessToken` admin changelist; `agent_tool_calls_per_week` = `mcp.tool_call` log lines; `last_used_at` distinguishes real use from curiosity. For the OAuth half: `oauth.client_registered` / `oauth.token_issued` log lines, and live `OAuthAccessToken` rows grouped by client. Splitting the two tells you *which front door people actually use* — the earlier `agent_oauth_interest` waitlist button existed only to answer that before OAuth was built, and is gone along with its endpoint.

## Not built (deliberate)

- **Elicitation** (server asks the client to prompt its user mid-call) — uneven client support.
- **Age gate** — there is no DOB or age field anywhere on `CustomUser`, so it was unimplementable.
- **Account-deletion / data-export wiring** — neither flow exists in this codebase. FK `CASCADE` covers token cleanup on user delete; whoever builds deletion/export should include `AgentAccessToken`, `AgentPendingWrite`, `OAuthAccessToken` and `OAuthAuthorizationCode`.
- **Editing an OAuth grant's scopes from Settings** — see above; disconnect/reconnect is the intended path.
- **Client attestation / a vetted-client allowlist** — DCR means any client can register. Consent is the control, which is why the consent screen names the app and lists exactly what it will reach.

## Pre-existing issues found while building this (not fixed here)

- `CourseSerializer` is `fields='__all__'` with only `id`/`user` read-only, leaving `parent_course` writable and unvalidated — a course can be parented to **another user's** row (IDOR). The agent path avoids it via `AgentCourseCreateSerializer`; the app API still has it.
- `EventListCreateView.post` never checks `FunctionRestriction`, so a chat-muted user can still create events and spawn chat rooms.
- Event names are never moderated — `moderation_pipeline` is report-driven and only handles `CONTENT_SNAP` / `CONTENT_CHAT`; there is no `Report.CONTENT_EVENT`. An event name becomes a chat room title with no takedown path.
