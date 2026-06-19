# CLAUDE.md

> **Keep this file under 500 words.** Summarise; don't exhaustively document. Read code for details.

## Commands

**Frontend:** `npm run dev` (5173), `npm run build`, `npm run lint`. **Backend:** `python manage.py runserver` (8000), `migrate`, `makemigrations`.

## Stack

`frontend/` React + Vite + Tailwind · `backend/` Django, single `main/` app. State lives in `App.jsx` → props; `AppShell` wraps router. JWT in localStorage via `authenticatedFetch`. React Router v6; `/feed` and `/chat/:roomId` protected. Body bg `cream` when logged in.

## Navigation

Desktop nav = feed / schedule; mobile bottom nav = feed / schedule / `+` / profile. **No `/friend` route** — the friends page is merged into `/feed`. Desktop: sticky `header-nav-app.jsx` (bell, avatar). Mobile: `mobile-top-bar.jsx` + `mobile-bottom-nav.jsx` (hidden on `/chat/<id>`; add `pb-24` to scrollable pages). **"+" menu** (`AddMenu.jsx`) in desktop header right + mobile center tab. `AppShell` polls `/api/chats/unread/` every 30 s.

## Key Gotchas

- **Feed `friendsList`** — flatten via `.map(f => f.friend_details).filter(Boolean)`.
- **Feed = social hub** (`components/feed/`, friends page merged in): snaps strip (`AvatarRow`, snap-only) + requests banner + stacked group/DM lists. DM sort = unread → free now (`useFriendsAvailability`) → last active; unread = red dot, subtitle = shared classes. `PeopleSearch` = friends matched **locally** (search endpoint excludes friends) + strangers from `/api/friends/search/`. Snap-to-friend: `SnapCaptureModal presetAudience` → `selected` visibility, one recipient.
- **Chat list** — `flex flex-col-reverse` DESC (index 0 = newest).
- **Snap expiry** — `expires_at` is display cliff; `is_removed` is moderation-only, not set on natural expiry.
- **Camera release** — call `window.location.reload()` after clearing course or Chrome's camera indicator sticks.
- **Course overlap** — strict `<` only; 10:00-end / 10:00-start touch allowed.
- **Profile picture** — frontend downscales ≤1024 px + JPEG @ 0.7; `profile_picture` is write-only, clients read `profile_picture_url`.

## Models (non-obvious)

`Snap`: `visibility` ∈ `all_friends|selected|group`; natural expiry doesn't set `is_removed`. `Message.message_type` ∈ `text|study_invite|event_card` with `metadata` JSON. `event_card` metadata: `{event_id, name, date, start_time, end_time, location, creator_username}`. `ChatRoomMember.is_admin` gates group ops; auto-promote oldest on last admin leave. `FunctionRestriction.expires_at` null = permanent. `ExternalCalendarEvent`: blocks calendar; never exposes `title` cross-user. `Event`: `visibility` ∈ `PRIVATE|SEMI|PUBLIC`; `chat_room` null until first accept. `Course.rep_date` / `Event.repeat_days` = `"MON,WED"` format.

## Availability & Study Coordination

- `backend/main/availability.py` — pure Python, no ORM. Key fns: `get_busy_blocks`, `get_free_slots`, `get_shared_free_slots`, `get_current_status`.
- Endpoints: `/api/availability/{me,friends}/`, `/api/availability/shared-gaps/`, `/api/study-invites/`. Friends endpoint: friend-gated, blocks respected, **no event titles leaked**.
- Frontend: `components/study/{FindTimeSheet,StudyInviteBubble}.jsx`. Feed polls every 60 s.

## Events

- Endpoints: `GET/POST /api/events/?week=YYYY-MM-DD`, `GET/PATCH/DELETE /api/events/<pk>/` (creator-only), `PATCH /api/events/invites/<pk>/`, `POST /api/events/<pk>/request-join/`, `POST /api/events/<pk>/rsvp/`.
- **`/rsvp/`**: lightweight accept/decline from a chat event card — finds the caller's invite by event PK, no invite PK needed. Body: `{status: "ACCEPTED"|"DECLINED"}`.
- **`/create` slash command in chat**: typing `/` in the chat input opens `SlashCommandMenu`; selecting "event" opens `ChatEventWizard` (2-step: name/date/time → location). On submit, calls `POST /api/events/` with `source_chat_room_id` + all chat member IDs as `invite_user_ids`. Backend auto-posts an `event_card` message to that room. Frontend injects an optimistic card immediately. `EventCardBubble` renders going/can't-go RSVP buttons calling `/rsvp/`. Components: `components/chat/{ChatEventWizard,EventCardBubble}.jsx`.
- **Repeating events expand** in list response — each occurrence has `occurrence_date` set; frontend places tiles by that.
- **Visibility**: PRIVATE/SEMI → creator + ACCEPTED invitees; PUBLIC → accepted friends of creator. PENDING invitees see bell invite only.
- **Chat room**: created eagerly if `create_chat=True` (default); no lazy fallback. Accept adds member; delete event → room's events SET_NULL but room stays.
- **Join requests**: PUBLIC + `allow_join_requests=True` only. Host accepts/declines via invites endpoint.
- **Conflict resolution**: overlap → `409 {error:"overlap", creator_conflicts, invitee_conflicts}`. Resend with `conflict_resolution` (`skip`|`keep_both`) + `proceed_invitee_conflicts`. Skip records (`CourseSkip`, `EventOccurrenceSkip`) CASCADE-delete with course/event.
- **Schedule skips**: `GET /api/schedule-skips/?week=YYYY-MM-DD` returns `{course_skips, event_skips}`.
- Frontend: `components/events/{AddEventModal,EventBlock,EventDetailsModal,ConflictSheet}.jsx`. `EventBlock` lilac, `z-index: 10`. `ConflictSheet.jsx` variants: `creator`, `self`, `host`.

## AI course parse (`backend/main/pdf.py`)

- Model `gpt-5-mini`. PDFs via OpenAI Files API; `.docx` via pdfplumber/python-docx.
- Schema returns `None` for unstated fields — never fabricate. Dates are `datetime.date`.
- **Reparse cap** = 3 / 24 h / user. Set `is_reparse=true` on `/api/courses/analyze/`; first free. Response carries `reparse_remaining`.
- **Add page** (`components/add/add.jsx`): overlap finalize returns `{error:"overlap", a, b, day}` → dedicated conflict screen.

## Deploy / Infra

GCS media when `GS_BUCKET_NAME` set; local `MEDIA_ROOT` otherwise. Cloud Run FS is ephemeral. Dockerfile: `migrate --noinput && exec gunicorn` (`exec` so signals reach gunicorn). `CONN_MAX_AGE=0`, gunicorn `--threads 2`. Moderation cron: Cloud Scheduler `*/10 * * * *` → `POST /api/admin/run-moderation/` with `X-Moderation-Secret`.

## Security / Work Style

Use `logger = logging.getLogger(__name__)`, never `print()`. `start_local.md` is gitignored — never include. Work style: show thinking before acting, plan before changes (wait for go-ahead), explain *why* not *what*. Default model: **claude-sonnet-4-6**.
