# CLAUDE.md

## Commands

**Frontend:** `npm run dev` (port 5173), `npm run build`, `npm run lint`
**Backend:** `python manage.py runserver` (port 8000), `migrate`, `makemigrations`

---

## Stack & Layout

- `frontend/` React + Vite + Tailwind, `backend/` Django; single `main/` app.
- State lives in `App.jsx`, passed as props. `App.jsx` extracts `AppShell` so `useNavigate`/`useLocation` work inside the Router.
- React Router v6 with `ProtectedRoute`; `/feed` and `/chat/:roomId` are protected.
- Body bg is `cream` when logged in. Outer wrapper is `flex-col h-screen`.
- Auth: JWT in localStorage, auto-refresh via `authenticatedFetch`. Password reset via Django's `PasswordResetView` at `/password_reset/`.

---

## Brand & Tokens

- Atoms in `@/components/shared/brand` — `T` (tokens), `FF` (fonts), `AppMark`, `Avatar`, `Blob`, `Squiggle`, `Star`, `PillBtn`, `MonoLabel`, `Chip`, `Toggle`, `Icon`, `Wordmark`. `AppMark` is the canonical app logo. `Toggle` is the iOS-style switch used in the profile accordion. Icon paths include `flag`, `dots`, `block`, `lock` (used by moderation + restriction surfaces).
- **Colors:** coral `#ED6A4A` (primary, CTAs, live), lilac `#C8B0DF` (secondary), lime `#C9EE6F` (sticker pops), ink `#1F1A22`, cream `#F8F4ED`. Tailwind: `coral{,-dark,-light}`, `lilac{,-dark}`, `lime`, `ink{,-{60,40,15,8}}`, `cream`, `paper`. Legacy `brand`/`brand-secondary`/`brand-accent` aliases still resolve.
- **Fonts:** Bricolage Grotesque (display, via `font-serif`/`FF.serif`), Geist (body, default), Geist Mono (labels/timestamps, via `font-mono`/`<MonoLabel>`). Tone: low-caps, casual.
- `Landing.jsx` + `header-navigation.tsx` + `mobile-header.tsx` are intentionally only partially reskinned (fonts + primary hex swapped).

---

## Navigation

- **Shared icons:** `application/app-navigation/nav-icons.jsx` exports `NavIcon` (Material Design SVGs); the local `NAV_ICON_PATHS` const is not exported (react-refresh lint rule).
- **Desktop (`hidden md:flex`):** `header-nav-app.jsx` — sticky top, `AppMark`+wordmark left; `feed`/`schedule`/`friends` pills (ink-on-cream when active); right cluster has bell (opens `NotificationsPanel` dropdown), lilac avatar circle → `/profile`, coral `log out` pill. The `feed` pill takes a `badge` prop and shows a coral count chip when `unreadChatCount > 0` and the user isn't on `/feed`.
- **Mobile top bar (`md:hidden`):** `mobile-top-bar.jsx` — `AppMark`+wordmark + bell with the same badge. Bell opens `NotificationsPanel variant="fullscreen"` with a backdrop. Hidden on `/chat/<id>`.
- **Mobile bottom (`md:hidden`):** `mobile-bottom-nav.jsx` — floating ink pill, 4 items (feed/schedule/friends/avatar). Active icon = coral filled circle. Avatar tab = lilac circle with the user's initial; coral ring when `/profile` is active. The `feed` icon shows a coral dot when `unreadChatCount > 0`. Hidden on `/chat/<id>`. Add `pb-24` to any scrollable page.
- **Unread badges:** `AppShell` polls `GET /api/chats/unread/` every 30s (effect dep includes `location.pathname` so it refetches on route change). Drives both the desktop pill count and mobile pill dot.
- **Footer:** wrapped in `hidden md:block` — desktop only. Mobile log-out is a wide coral pill at the bottom of `/profile`.

---

## Home / Week View (`/`)

`home/week_view.jsx` — Mon–Sun grid (left) + side rail (right). Header: `WEEK OF <date>` mono + `ur week, ur ppl` Bricolage + live coral `<DAY> · h:mm AM` clock pill (updates every 30s) + `N friends live now` + `+ add class` → `/Add`.

Day columns get a stable palette keyed by hash of `course_id`; current day = coral tint; live class blocks = coral ring; the "now" line is a coral horizontal bar. Hour range auto-clamps to data (default 8–18, expands).

**Class blocks:** full-width clickable buttons opening `CourseDetailsModal`. Blocks under 56px height stack vertically (code on top, avatars on bottom). **Overlap chip:** primary block renders a coral-outlined `+N` chip → opens `CourseDetailsModal` in master-detail mode (cluster left, selected entry right).

**Side rail:** dark `LIVE NOW` card with coral `Blob`; white `TODAY` card (mono `TODAY · DAY DATE` + count, `HAPPENING NOW` coral sub-card, then `COMING UP` timeline); white `REMINDERS FOR TODAY` listing today's assignments (lime `DUE` chip) and exams (coral `EXAM` chip). Empty state `all clear today ✓`. Reminders read from `/api/courses/` once on mount.

**`CourseDetailsModal` (`home/CourseDetailsModal.jsx`):** lazy-fetches `/api/courses/` on open, keys by `course_id`. Two modes — single class (header banner) or cluster master-detail (avatar+code+room rail left, entry right). Right pane: colored banner (course id + name + `DAY · h:mm–h:mm · location`) + `who's in this` avatar-chip row. Sections `this week` / `upcoming` / `full course page →` only render when the matched Course has `weeks`/`exams`/`assignments` or `has_ai_content=true`.

---

## Feed (`/feed`)

`feed/feed.jsx` — header `ur feed` + mono date.

**Pills are sort-priorities, not filters** — every accepted friend always shows. `today` → snapped-today first; `my_classes` → shared-course friends first; `friends` → snap-havers first. Peach `N on` badge counts live snap-havers (last 30 min). **No** sort dropdown or snap-card list — snaps only via avatar row.

**Avatar row:** `me + plus` tile, then friends ordered primary/rest. Snap-havers get coral ring; non-snap friends get faded `ink-15` ring at 60% opacity (rest-tail uses a session-stable seeded shuffle). Snap-haver click → `SnapViewerModal`; no-snap friend click → `openChat(friend)` (create-or-get DM, then `navigate('/chat/<id>')`).

**Me tile status:** context class from `personalSchedule` (currently-happening, else next-up today). Shows `snap for <code>` (coral) if I haven't snapped, or `snapped Xm ago` / `for <code>` if I have. Falls back to plain `u`.

**Inbox** splits into two cards driven by one `/api/chats/` fetch (on mount + window focus):
- **Group chats card** (above messages): header pill `+ new group` opens `GroupCreateModal`. Rows: 3-avatar overlapping cluster (`members_preview`) + Bricolage name + member-count chip + unread badge + `sender_username: <preview>` line + time chip. Empty state = dashed-pill prompt. Tap → `/chat/<id>`.
- **DM inbox:** `avatar · username · preview · time chip` with coral unread badge (`N` / `9+`). Preview = `last_message.content`, italic `[message removed]` when `is_removed`, or `snapped Xm ago` / `tap to chat` fallback. **All** friends always show. Sort: unread → recent `last_message.created_at` → snap-havers → alphabetical.

Row click + no-snap avatar tile click share the same `openChat` handler (POST `/api/chats/` `{friend_id}`, friend-gated dedup); inline spinner while in flight.

**Data shape gotcha:** `friendsList` items are friendship rows (`{id, user, friend, status, friend_details}`), NOT user objects — flatten via `friendsList.map(f => f.friend_details).filter(Boolean)`. Server already filters to `status=1`.

---

## Chat (`/chat/:roomId`)

`chat/ChatThread.jsx` — protected; desktop 2-col (chat + side aside, `maxWidth: 1100`), mobile stacks. Chat column height-capped at `calc(100dvh - 120px)` so input stays put; aside scrolls independently on desktop. `isGroup = room.room_type === 'group'` drives every branch.

**Header:** back chevron → `/feed`. DM: hash-colored Avatar + Bricolage username + mono `active Xm ago` / `last seen H:MM am` from `other_user.last_seen`. Group: overlapping 3-avatar cluster + group name + `N members · tap for info` mono sublabel; whole header is a button → `GroupInfoModal`.

**Message list:** `flex flex-col-reverse` over a DESC-ordered `messages` array (matches API). New messages prepend to index 0 and land at the visual bottom — no manual scroll. Bubble = coral/white for me, `T.ink08` for others, italic `[message removed]` at `T.ink40` for soft-deleted, `__pending` dims 0.6, `__failed` shows `↻ retry`. Per-message mono timestamp on the newest message and any with a > 5 min gap to the previous (older) one.

**In groups only:** `SenderLabel` (mini avatar + mono username) prepends the first non-mine bubble in each continuous run (different sender OR > 2-min gap). `showSenderByIdx` precomputed by walking the DESC array and inspecting the *next* index (= previous bubble visually under flex-col-reverse).

**Input bar:** autosizing textarea (1–5 lines), Enter sends / Shift+Enter newlines, 2000-char hard cap (client clamps, server rejects 400), `chars left` counter at ≥1800 (turns coral within 50 of cap), inline paper-plane SVG. Placeholder = `message @username` (DM) / `message <group name>` (group). Optimistic send appends `pending-<ts>`, replaced on 201, flipped to `__failed` on error.

**Load older:** `IntersectionObserver` on a sentinel placed last in DOM (= visual top under col-reverse) → `GET /api/chats/<id>/messages/?before=<oldest_id>`, merges by id, sets `olderExhausted` on empty.

**Polling:** 5s `setInterval` while `document.visibilityState === 'visible'`, paused/resumed on `visibilitychange` + `focus`. `markRead()` (`POST /read/`) fires on mount and whenever the poll observes a new message from another user.

**Empty state:** `say hi to @username 👋` (DM) / `say hi in <group name> 👋` (group). Errors: `forbidden` / `not_found` / `network`.

Mobile floating bottom nav **and** mobile top bar are hidden on `/chat/<id>` via a `location.pathname.startsWith('/chat/')` check in `AppShell`.

**Side panel (DM):** `SharedClassesCard` intersects `allClasses` by `base_course` for today using my entry's `start_time/end_time/location`, highlighting the currently-in-session class with coral fill + `now` chip. `TheirSnapsCard` filters `snapsByCourse` by `uploader_username === other_user.username` and `created_at >= startOfDay`, renders a 3-col 4:5 thumbnail grid; click opens `SnapViewerModal` with `courseLabel='@username'`. Thumbs use a local `resolveMediaUrl` mirroring the viewer's (prefix relative `/media/` with `VITE_API_URL` in dev; absolute GCS URLs pass through).

**Side panel (group):** `GroupMembersCard` (avatar + username + lime `admin` chip per member, `manage group →` link) + `GroupSharedClassesCard` (today's classes where ≥2 members are enrolled, derived from `allClasses` by mapping `owner === 'Me'` → `currentUser.username`; `N in` chip per class, currently-live class gets coral fill).

**`GroupInfoModal` (`chat/GroupInfoModal.jsx`):** inline rename (admin), member list with per-row remove ✕ (admin, hidden for self), `+ add` opens an inline friend-picker grid (`addableFriends = friendsList - currentMembers`), `leave group` coral pill. Friend list is lazy-fetched from `/api/friends/` only when the modal opens. A 204 from member-remove means the room was soft-deleted (last member out) → `onLeft()` navigates back to `/feed`.

**Snap reply in chat:** messages with `replied_snap` render `SnapReplyCard` above the bubble (4:5 44×56 thumb + course chip + 50-char caption snippet). When the snap is gone (`is_expired` from purged media, or `is_removed` from moderation/user delete), the card switches to a muted "snap · expired / this snap is no longer available" placeholder. Card is shown above soft-deleted (`is_removed`) messages too so reply context survives. No click handler in v1.

---

## Snap Pipeline

**Entry points:** `+` avatar tile on `/feed`. 0 own courses = noop; 1 = straight to capture; >1 = course-picker modal. Snap capture is **not** in nav.

**`SnapCaptureModal` (`snap/SnapCaptureModal.jsx`):** dark `T.ink` shell, 78px coral shutter, focus brackets, course pill on viewfinder. Header is dynamic: `snap <course code>` if `isLiveNow`, else `snap now`. Camera: `getUserMedia` 1080×1350, photo via canvas JPEG q=0.85, video via `MediaRecorder` 5s hard cap (mp4 on Safari, webm on Chrome — backend accepts both). Library-upload fallback via `<input type="file">`.

**Camera release:** parent `onClose` runs `window.location.reload()` after `setCaptureCourse(null)` — without this Chrome's camera indicator stays stuck.

**Upload constraints:** 20MB max, allowed types `image/jpeg|png` + `video/mp4|quicktime|webm`, magic-byte check, server-generated path `snaps/<user_id>/<uuid>.<ext>`, **4:5 portrait** (`TARGET_RATIO = 4/5`, modal preview and viewer both use `aspect-[4/5]`), **caption max 50 words** (server splits on whitespace + slices).

**Visibility:**
- `'all_friends'` — no audience rows; feed joins through current `Friend` table at read time, so late-added friends can view.
- `'selected'` — per-friend `SnapAudience` rows as allowlist.
- `'group'` — accepts **either** `group_id` (resolves to `SnapGroupMember.user_id`s of a standalone SnapGroup the caller owns) **or** `chat_room_id` (resolves to `ChatRoomMember.user_id`s of a group chat the caller is a member of). Either is intersected with the caller's accepted friends → `SnapAudience` rows. Non-friends in either roster are silently dropped — never a validation error. The ChatRoom is the source of truth for group audiences (no auto-mirrored SnapGroup per chat); any chat member can snap to the chat's audience.

**Capture audience picker:** three pills (`all` / `selected` / `group`). The `group` pill renders one combined list — chat-linked groups (with chat-bubble icon) **plus** standalone SnapGroups. Selection state is unified as `selectedGroup = { kind: 'chat' | 'snap_group', id }`; the form posts `chat_room_id` or `group_id` accordingly. Both sources fetched in parallel on mount (`/api/chats/` filtered to `room_type='group'` + `/api/snap-groups/`).

**Expiry vs retention:**
- `expires_at` = midnight of the next day in the user's IANA timezone (browser sends `timezone`; backend uses `zoneinfo`). This is the **display cliff** — `SnapFeedView` filters `expires_at__gt=now`. DB row + GCS blob stay.
- **Retention:** moderation cron purges the GCS blob and clears `media_file` (row kept as tombstone) when `created_at < now - 30 days` (`SNAP_MEDIA_RETENTION_DAYS`), skipping snaps with any in-flight `Report` so moderation evidence is preserved.
- `is_removed=True` is reserved for user/moderation removals — naturally expired snaps do **not** flip it.

**`SnapUploadView`** short-circuits with **403 `{detail:'restricted', restriction_type, expires_at, offense_count}`** when the caller has an active `FunctionRestriction` of `snap_posting` or `both`. `SnapCaptureModal` GETs `/api/restrictions/my/` on mount and never starts the camera if a restriction is in force; a reactive 403 swaps the body to the same banner. `SnapFeedView` and `SnapViewView` also exclude uploaders the caller has a `UserBlock` with (either direction).

**`SnapViewerModal`:** dark shell; receives `prevTile`/`nextTile`/`onSelectPrev`/`onSelectNext`/`onAdd` (parent tracks `viewerTileIdx` into `tiles`). Side `Avatar`s positioned absolutely on the backdrop — left = previous uploader (or add-snap icon if at the first tile, which closes the viewer and runs `handleAddClick`); right = next uploader. Internal chev arrows page within one uploader's snaps; `useEffect([snaps])` resets `idx` to 0 when switching uploaders. Header subline appends `· snap from <course>` when the snap's `created_at` HH:MM falls inside that course's class window.

**View tracking:** `POST /api/snaps/<id>/view/`. `SnapAudience` doubles as the view-tracker, lazy-created on first view for `all_friends`. `view_count` = count of `SnapAudience` rows with `has_viewed=True`; uploaders aren't counted (no self-audience row written). Uploader soft-delete: `DELETE /api/snaps/<id>/`.

**IG-style snap reply (from viewer footer):** `reply to @<uploader>` button slides up an inline text input. On open it lazily fires `POST /api/chats/` to resolve the DM (`sentRoomId` cached for the session); Enter sends `POST /api/chats/<roomId>/messages/` with `{content, replied_snap_id}`. Success collapses the input, fires a 1.4s `sent ✓` toast pinned to the top of the dark shell, keeps the viewer open. Per-snap reply state resets when `idx` or `snaps` changes.

**Focus bug guard:** The viewer's outer shell focuses once on mount via `useRef` + `useEffect([])`, **not** via an inline ref callback — the callback re-fires on every render and steals focus from the reply textarea on every keystroke.

---

## Friend page (`/friend`)

`friend/friend.jsx` — receives `allClasses` from `App.jsx` so it can derive "live now" friends (any class today where `nowMins` ∈ [start, end] and `owner` isn't `Me` / `currentUser.username`).

Header: mono `<N> FRIENDS · <M> IN CLASS NOW` + `ur ppl ◆` Bricolage + debounced (250ms) search + dark `+ find more` (scrolls to suggested panel). Filter pills with counts: `all` / `my classes` / `my year` / `live`. Sort dropdown: recently active / live first / name.

**Empty search:** 1fr/320px split — left: horizontal `LIVE NOW` dark strip (up to 5 tiles, `avatar+username+course`) + `recently active` 3-col `FriendCard` grid (big avatar + coral ring if live + `LIVE NOW`/`RECENTLY` badge + course pills colored by `dotForCourse(courseId)` + `snapped Xm ago` from `last_snap_at` or `active Xm ago` from `last_seen`, dark `message` button (disabled — "messages coming soon") + cream calendar button). Right rail: `RequestsCard` (inline ✓/× accept-reject) + dark `SuggestedCard` with lilac `Blob` (calls `searchfriends(currentUser.major)` on mount).

**Typing in search:** swaps grid for compact `SearchResultRow` list. Incoming requests only render in the right-rail RequestsCard, not inline above results.

---

## Profile (`/profile`)

`user/profile.jsx` — `settings & such` title + 340px/1fr grid: dark profile card left, accordion right. Three sections (one open at a time, `notifications` open by default):
- **profile details:** read-only grid + `edit profile` button — clicking flips the entire right column to the inline edit form via `isEditing`; PATCH `/api/user/`.
- **notifications:** four `Toggle` rows mapping to `NotificationPreference` (`snaps_from_friends`, `class_is_live`, `weekly_recap`, `quiet_hours_enabled`); two `<input type="time">` controls revealed when quiet hours on. Optimistic toggle: flip locally → PATCH `/api/notifications/preferences/` → revert on error.
- **snap groups:** list of `SnapGroup` cards with inline rename/delete + per-friend member toggle chips, `+ new group` dashed pill opens a create panel (name + multi-select). Member-toggle hits `POST/DELETE /api/snap-groups/<id>/members/[<user_id>/]`.

Below the grid: `weekly schedule`, `all my courses`, `blocked users` (lists `/api/blocks/` with per-row unblock; copy clarifies `appeal_auto` rows are one-directional). Then mobile-only coral `log out` pill (wired through `onLogout` prop threaded from `AppShell` → `Profile`).

---

## Notifications

`GET /api/notifications/` — fully computed, no stored model. Five sections:
- `friend_requests` — pending `Friend` rows where I'm recipient.
- `new_snaps` — non-expired friend snaps with no `SnapAudience.has_viewed=True` row for me.
- `live_class_alerts` — courses live right now (HH:MM string comparison matching frontend `isLiveNow`) where ≥3 friends share the same course; returns `{course_id, course_name, friend_count, friends[]}` capped at 5 friends.
- `reports_received` — reports against me with `report_document`, `recommended_action`, `status`, `appeal_deadline`, `can_appeal`; latest 10, terminal statuses excluded.
- `reports_filed` — my reports + latest AI doc, latest 10.

Moderation blocks are wrapped in `try/except` so pre-moderation-deploy payloads still serve. **Preference gating:** auto-creates `NotificationPreference` on first read; short-circuits `new_snaps` when `snaps_from_friends=False` and `live_class_alerts` when `class_is_live=False`. `weekly_recap` + `quiet_hours_*` persist but don't influence the response yet — staged for a future push/email pipeline.

**`NotificationsPanel.jsx`** is the single component used by both surfaces via `variant`:
- `dropdown` (default) — desktop popover anchored below the bell (`top-full mt-2 w-[22rem]`).
- `fullscreen` — mobile sheet (`w-full h-full flex flex-col`) with a header × close; `MobileTopBar.jsx` owns the backdrop + body-overflow lock + click-prop stop.

Both variants share: five sections, accept/decline pipeline (`onRespondToRequest` threaded from `App.jsx` → `AppShell` → header/top-bar), empty state `all clear ✓`, coral bell badge counting `friend_requests.length + new_snaps.length + reports_received.filter(r => r.can_appeal).length`, and `onRefresh` prop the inline `AppealModal` calls on submit to drop the row.

---

## Models

- **`Course`** — slots, assignments, exams; `has_ai_content` flag, `parent_course`, `is_lab`.
- **`Friend` / `FriendRequest`** — `status` ACCEPTED for `/api/friends/`.
- **`CustomUser`** — `university`, `major`, `grad_year`, `last_seen` (nullable indexed datetime, stamped by `LastSeenMiddleware` at most once per 60s on authenticated requests).
- **`Snap`** (`uploader`, `course`, `media_file`, `media_type`, `caption`, `visibility` ∈ `all_friends|selected|group`, `is_removed`, `expires_at`).
- **`SnapAudience`** (`snap`/`viewer` unique_together, `has_viewed`, `viewed_at`) — doubles as allowlist for `selected`/`group` and view-tracker for `all_friends`.
- **`ChatRoom`** (`room_type` `dm|group` default `dm`, `name` nullable but required for groups, `created_by`, `linked_snap` nullable + unused, `is_active`).
- **`ChatRoomMember`** (`room`/`user` unique_together, `is_admin`, `last_read_at`) — `is_admin` active in groups: gates rename/add/remove and auto-promotes the oldest member when the last admin leaves; ignored in DMs.
- **`Message`** (`room`/`sender`, `content`, `reply_to` nullable, `replied_snap` nullable → SET_NULL on Snap delete, `is_removed`, `removed_at`, `created_at`). Default ordering newest-first, index `(room, -created_at)`. Soft-deleted messages keep `content` for moderation; `MessageSerializer` blanks it client-side via `get_content`.
- **Settings/sharing** (migration `0015_settings_and_snap_groups`):
  - `NotificationPreference` (one-to-one with User, defaults: `snaps_from_friends=True`, `class_is_live=True`, `weekly_recap=False`, `quiet_hours_enabled=False`, `quiet_hours_start=22:00`, `quiet_hours_end=08:00`).
  - `SnapGroup` (`owner`, `name` ≤50, `ordering=['-updated_at']`).
  - `SnapGroupMember` (`group`/`user` unique_together) — members must be friends at *add* time; non-friends in a stale group are filtered at snap-send time, so the row itself never needs cleanup on friendship dissolution.
- **Moderation** (migration `0014_moderation`):
  - `Report` (`reporter`/`reported_user`, `content_type` `snap|chat_message`, nullable snap/chat_message FKs, `template_reasons` JSON, `free_text`, `status` ∈ pending/ai_reported/appeal_pending/appeal_analyzed/third_loop/enforced/appeal_upheld/warned/admin_removed/admin_dismissed, `appeal_deadline`).
  - `AiReport` (report/version 1/2/3 unique_together, `provider`, `raw_response` JSON, `report_document` (user-facing), `violation_likelihood`, `violation_categories`, `recommended_action` `remove|warn|dismiss`).
  - `SimilarityCheck` (one-to-one with Report, v1/v2 FKs, cosine `similarity_score`, `provider='text-embedding-3-small'`).
  - `Appeal` (one-to-one with Report, `reason`, `status` `pending|enforced|upheld`).
  - `FunctionRestriction` (`user`, `restriction_type` `snap_posting|chat_messaging|both`, `report` nullable, `offense_count`, `expires_at` nullable=permanent, `is_active`).
  - `UserBlock` (`blocker`/`blocked` unique_together, `reason` `appeal_auto|manual`, `report` nullable).

---

## API — Chat

Ten endpoints under `/api/chats/`.

- `GET /` — my room list (DMs + groups), sorted unread → recent → room age. DM rows flatten `other_user`; group rows expose `name` / `member_count` / `members_preview` (first 3 in `joined_at` order). `last_message` includes `sender_username` so the inbox can render `alice: hi`.
- `POST /` `{friend_id}` — create-or-get DM, **friend-gated** via `_are_friends` (returns 403 `{detail:'not_friends'}`), block-rejected via `_is_blocked_between` (403 `{detail:'blocked'}`), deduped via `_find_existing_dm`.
- `GET /<id>/` — room + last 50 messages, descending. For groups also returns `name` / `members[]` (with `is_admin`) / `is_admin` (caller's flag).
- `GET /<id>/messages/?before=<msg_id>&limit=50` — paginated older messages.
- `POST /<id>/messages/` — body `{content, replied_snap_id?}`. Trims, empty→400, >2000 chars→400. `replied_snap_id` is silently dropped if the caller can't view that snap (same authorization the `SnapViewView` enforces: uploader / `all_friends`-via-friendship / explicit audience). 403 `{detail:'restricted', restriction_type, expires_at, offense_count}` when a `FunctionRestriction` of `chat_messaging`/`both` is active. **DM** also 403s on `blocked`; **groups** do not — membership wins; block-filtering happens on read instead.
- `DELETE /<id>/messages/<msg_id>/` — sender-only soft delete.
- `POST /<id>/read/` — bumps caller's `last_read_at`.
- `GET /unread/` — `{total: N}` summed across all my active rooms, excluding messages from blocked users (matches the in-room filter).
- **Groups:**
  - `POST /api/chats/groups/` `{name, member_ids[]}` — creator becomes the first `is_admin=True` member; min 2 other members; friend-gated against creator (403 `{detail:'not_friends', stranger_ids:[…]}`), block-gated (403 `{detail:'blocked', blocked_ids:[…]}`).
  - `GET /api/chats/groups/<id>/` — group room payload.
  - `PATCH /api/chats/groups/<id>/` `{name}` — rename, admin-only, ≤80 chars (`GROUP_NAME_MAX_LEN`).
  - `POST /api/chats/groups/<id>/members/` `{user_id}` — admin-only, friend-gated against the **admin** (not every existing member), idempotent.
  - `DELETE /api/chats/groups/<id>/members/<user_id>/` — admin can remove anyone; self can leave. If last admin leaves and members remain, oldest is auto-promoted. If last member out, room is soft-deleted (`is_active=False`) and response is 204 — frontend treats this as "navigate to feed".

**Friend-gate scope for groups:** membership row authorizes message send. Non-mutual friends in a group can chat (the admin vouched for them by inviting). **UserBlock in groups:** does NOT block sends; instead the server filters blocked-user messages out of each side's reads (`ChatDetailView`, `MessageListCreateView.get`, `ChatListCreateView.get` for last_message + unread, and `UnreadCountView`). No ghost bubbles.

`ChatThread.jsx` reads `/api/restrictions/my/` on mount and swaps the input bar for a `ChatRestrictionBanner` (lock icon + expiry copy) when restricted or blocked.

---

## API — Snap groups

`/api/snap-groups/` — standalone audience presets (no chat associated).

- `GET /` — caller's groups (with members + member_count).
- `POST /` `{name, member_ids[]}` — server friend-gates `member_ids` (403 `{stranger_ids:[…]}` if any aren't friends).
- `GET/PATCH/DELETE /<id>/` — owner-only; PATCH only renames.
- `POST /<id>/members/` `{user_id}` — idempotent friend-gated add.
- `DELETE /<id>/members/<user_id>/`.

All endpoints touch `group.updated_at` so the list sorts most-recently-touched first (matches the model's `ordering = ['-updated_at']`).

---

## API — Settings, notifications, snaps, friends

- **Notifications prefs:** `GET/PATCH /api/notifications/preferences/` — auto-creates on first GET with defaults (`22:00–08:00`, both noti toggles on, recap+quiet off).
- **Snaps:** `POST /api/snaps/` (upload), `GET /api/snaps/feed/` (returns `snaps_by_course` keyed by Course PK), `POST /api/snaps/<id>/view/` (mark viewed, creates `SnapAudience` lazily for `all_friends`), `DELETE /api/snaps/<id>/` (uploader soft-delete).
- **Friends:** `/api/friends/`, `/api/friends/search/`, `/api/friend-requests/...`. `UserSerializer.last_snap_at` is a `SerializerMethodField` that reads a precomputed `last_snap_by_user_id` map from context (single `Max('created_at')` aggregate in `FriendListView.get_serializer_context`) — avoids N+1; returns `None` outside the friends-list path.

---

## API — Moderation

User-facing:
- `POST /api/reports/` `{content_type, snap|chat_message, template_reasons[], free_text}`. Dedups same-reporter+same-content in-flight reports → 409. Self-reports → 400. Missing target → 400.
- `GET /api/reports/{my,received}/` — prefetches `ai_reports` + `appeal`. `received` includes `can_appeal` derived from `status='ai_reported'` + `appeal_deadline > now` + no existing Appeal.
- `POST /api/appeals/` — reported-user only; status must be `ai_reported`, inside deadline, no prior appeal → moves report to `appeal_pending`.
- `GET /api/appeals/my/`.
- `GET /api/blocks/` + `DELETE /api/blocks/<id>/` — manual unblock; one-directional. `appeal_auto` rows on both sides have to be lifted separately by each user.
- `GET /api/restrictions/my/` — used by frontend to pre-disable capture/chat without waiting for a 403.

Admin/staff:
- `GET /api/admin/reports/`, `POST /api/admin/reports/<id>/act/` `{action:'remove'|'dismiss'}`.

Cron:
- `POST /api/admin/run-moderation/` — `permissions.AllowAny` but rejects unless `X-Moderation-Secret` header matches `settings.MODERATION_RUN_SECRET` (no setting → 503). Both `AdminRunModerationView` and `python manage.py run_moderation` call the same `run_moderation_tick()`.

**Frontend (`ReportModal.jsx`):** dark `T.ink` shell. Chip rows differ by `contentType` — snap: inappropriate/harassment/spam/violent/hate_speech/other; chat: harassment/hate_speech/threats/spam/private_info/other — plus an optional 1000-char free-text box. 409 `duplicate` is treated as a success no-op. Entry points: `SnapViewerModal` footer's `report` button + per-bubble ⋮ menu in `ChatThread.jsx` (hover-revealed on desktop, long-press / right-click on touch).

---

## Moderation pipeline

`main/moderation_pipeline.py` — `run_moderation_tick()` processes reports in three states per pass:

- `pending` → v1 AI report + 7-day `appeal_deadline` + emails to both parties → `ai_reported`.
- `appeal_pending` (set when reported user files appeal) → v2 + `text-embedding-3-small` cosine similarity → ≥0.60 routes to `enforce()` / `mark_warned()` / `appeal_upheld()` based on v1+v2 majority; <0.60 advances to `third_loop` (crash-recovery checkpoint), runs v3 tiebreaker, then 2-of-3 remove → `enforce()`, all-`warn` → `mark_warned()`, else → `appeal_upheld()`.

**Content extraction:** snap photo (GCS download → base64), snap video (first frame via `cv2.VideoCapture`), chat message (DB content, even when `is_removed=True`). `call_gpt4o_mini()` uses `response_format={'type':'json_object'}` against the `OPENAI_API_KEY` client.

**`enforce()`** soft-deletes the content, looks up `FunctionRestriction.objects.filter(user=...).count() + 1` as the offense number, applies the duration ladder (3d / 7d / 30d / permanent), sends admin alert at offense ≥3.

**`appeal_upheld()`** creates two mutual `UserBlock` rows tagged with the report.

`admin_remove` / `admin_dismiss` reuse the same primitives so `POST /api/admin/reports/<id>/act/` and the AI tick produce consistent restriction/email state.

**Snap media purge** (`purge_snap_media`): deletes GCS blob and clears `media_file` for snaps where `created_at < now - 30 days`, skipping any with an in-flight `Report` (`pending` / `ai_reported` / `appeal_pending` / `appeal_analyzed` / `third_loop`) so evidence stays through the appeal window. Snap row stays as a tombstone (caption, audience, Report FKs preserved); `is_removed` is **not** flipped.

The tick also flips `is_active=False` on expired `FunctionRestriction` rows (no separate cron).

**Emails:** `main/moderation_email.py` — 7 scenarios via Anymail/Resend. `MODERATION_FROM_EMAIL` overrides `DEFAULT_FROM_EMAIL` for moderation specifically; `MODERATION_ADMIN_EMAIL` receives repeat-offender alerts. Each send wrapped in `try/except` — a Resend hiccup never blocks state transitions.

---

## Course upload

`add.jsx` → `/api/courses/analyze/` → GPT-4o-mini parsing → `/api/courses/finalize/` persists. **Constraints:** 5MB max, `.pdf`/`.docx` only, magic-byte check, server-generated filename. Keep all four checks if editing; `pdf.extract_text` raises on unknown extensions.

**Overlap guard (`CourseFinalizeView`):** before any DB write, rejects 400 `{error:'overlap', detail, a, b, day}` if any incoming slot overlaps another incoming slot **or** an existing course of the same user on a shared weekday. Helpers `_slot_to_minutes` / `_parse_rep_days` / `_find_overlap_day` live just above the view in `views.py`. Touching boundaries (10:00 end vs 10:00 start) are not flagged — only strict `<` overlap. Whole payload is rejected on the first conflict; no partial inserts.

---

## Storage, deploy, external

- **Media:** `django-storages[google]`. `STORAGES["default"]` toggles to `GoogleCloudStorage` when `GS_BUCKET_NAME` is set (public URLs, `querystring_auth=False`, IAM-based ACL — bucket grants `allUsers:objectViewer` for read). Unset locally → `MEDIA_ROOT`. Cloud Run FS is ephemeral; **prod must set `GS_BUCKET_NAME`**.
- **Deploy:** Dockerfile `CMD` runs `python manage.py migrate --noinput && exec gunicorn …` so each new revision self-applies migrations on cold-start. `exec` matters — signals must reach gunicorn.
- **Infra:** `CONN_MAX_AGE=0` + gunicorn `--threads 2` to stay within `db-f1-micro` 25-connection limit (3 instances × 2 workers × 2 threads = 12 peak).
- **External:** OpenAI (GPT-4o-mini for course parsing + AI moderation, `text-embedding-3-small` for appeal-similarity, `OPENAI_API_KEY`), Resend (email), Sentry (errors), Cloud SQL (Postgres), Cloud Run, AdSense (`ca-pub-9825491172037028`, push in `useEffect`, needs `ads.txt`).
- **Moderation env vars** (prod-only): `MODERATION_RUN_SECRET` (required to enable `POST /api/admin/run-moderation/`; missing → 503), `MODERATION_FROM_EMAIL` (optional), `MODERATION_ADMIN_EMAIL` (optional). Cloud Scheduler `*/10 * * * *` us-central1 hits the endpoint with `X-Moderation-Secret`; Auth → OIDC token, default compute SA, audience blank (auto-filled to the Cloud Run URL).

---

## Error UX

Backend/server errors trigger a bottom-right toast (`ErrorToast.jsx`) via the `server-error` window event and `isErrorReportModalOpen` state in `App.jsx`. Toast auto-dismisses after 8s; links to `help@timetify.net`. No modal.

---

## Security

- **Prod settings:** `SECRET_KEY` required (no `django-insecure-`). `SECURE_*`/HSTS/`SECURE_PROXY_SSL_HEADER` auto-enabled. `CORS_ALLOWED_ORIGINS` & `CSRF_TRUSTED_ORIGINS` are explicit allowlists; `ALLOWED_HOSTS` doesn't auto-expand.
- **API:** `UserSerializer` read-only fields are `['id', 'username', 'email', 'status', 'shared_courses', 'last_seen', 'last_snap_at']` — don't loosen `username`/`email` without email verification (`major`/`grad_year` are writable via PATCH). `shared_courses` returns `course_id` strings the caller and target both have (computed per request). `SearchFriend` is username-only (no email search).
- **Logging:** use `logger = logging.getLogger(__name__)`, never `print()` — `send_default_pii=True` leaks data to Sentry.

---

## Privacy

`start_local.md` is gitignored and local-only. **Never** record, memorize, save to memory files, or include any content from `start_local.md` in responses, commits, or any other persistence mechanism.

---

## Work Style

1. Show thinking & assumptions before acting.
2. List execution plan before file changes; wait for go-ahead.
3. Explain *why* each change (problem/requirement), not what it does.
