# CLAUDE.md

> **Keep this file under 500 words.** Summarise; don't exhaustively document. Read code for details.

## Commands

**Frontend:** `npm run dev` (5173), `npm run build`, `npm run lint`
**Backend:** `python manage.py runserver` (8000), `migrate`, `makemigrations`

---

## Stack

- `frontend/` React + Vite + Tailwind · `backend/` Django, single `main/` app.
- State in `App.jsx` → props; `AppShell` wraps router so `useNavigate`/`useLocation` work. JWT auth in localStorage via `authenticatedFetch`.
- React Router v6; `/feed` and `/chat/:roomId` protected. Body bg `cream` when logged in.

---

## Brand

- Atoms: `@/components/shared/brand` — `T` (tokens), `FF`, `AppMark`, `Avatar`, `ProfileAvatar`, `PillBtn`, `MonoLabel`, `Chip`, `Toggle`, `Icon`.
- **Colors:** coral `#ED6A4A` (CTAs/live), lilac `#C8B0DF`, lime `#C9EE6F`, ink `#1F1A22`, cream `#F8F4ED`.
- **Fonts:** Bricolage Grotesque (`font-serif`, display), Geist (body), Geist Mono (`font-mono`, labels). Tone: low-caps, casual.
- **ProfileAvatar:** Shows profile picture if available, falls back to Avatar initials. Used in profile card and all avatar displays.

---

## Navigation

- **Desktop** `header-nav-app.jsx` — sticky; feed/schedule/friends pills; bell → `NotificationsPanel` dropdown; avatar → `/profile`.
- **Mobile top** `mobile-top-bar.jsx` · **Mobile bottom** `mobile-bottom-nav.jsx` — both hidden on `/chat/<id>`. Add `pb-24` to any scrollable page.
- Unread badge: `AppShell` polls `GET /api/chats/unread/` every 30s.

---

## Key Gotchas

- **Feed `friendsList`:** items are `{id, user, friend, friend_details}` rows — flatten via `.map(f => f.friend_details).filter(Boolean)`.
- **Chat message list:** `flex flex-col-reverse` over DESC array — index 0 = newest at visual bottom.
- **Snap expiry:** `expires_at` = display cliff (midnight next day); GCS blob purged at 30 days. `is_removed` is moderation/user-only — natural expiry does **not** set it.
- **Camera release:** `onClose` must call `window.location.reload()` after clearing course or Chrome's camera indicator stays stuck.
- **Snap `group` visibility:** accepts `group_id` (SnapGroup) **or** `chat_room_id` (ChatRoom members), intersected with accepted friends.
- **Course overlap guard:** strict `<` overlap only; touching boundaries (10:00 end / 10:00 start) are allowed.
- **Groups + UserBlock:** blocks do **not** prevent sends — blocked-user messages are filtered on every read path instead.
- **Profile picture:** uploaded images are compressed to 70% JPEG quality. Frontend syncs via `ProfileAvatar` component. `profile_picture_url` returned from `GET /api/user/` and login uses `request.build_absolute_uri()` to generate absolute URLs for cross-origin dev/prod support.

---

## Models (non-obvious fields)

`Snap` — `visibility` ∈ `all_friends|selected|group`, `is_removed`, `expires_at`.
`ChatRoomMember` — `is_admin` gates group rename/add/remove; oldest member auto-promoted when last admin leaves.
`Message` — `replied_snap` SET_NULL on Snap delete; soft-delete retains `content` for moderation.
`FunctionRestriction` — `restriction_type` ∈ `snap_posting|chat_messaging|both`; `expires_at` null = permanent.
`CustomUser` — `profile_picture` ImageField, optional, stored in `profile_pictures/` directory. Frontend gets URL via `profile_picture_url` (SerializerMethodField using `request.build_absolute_uri()`).

---

## Deploy / Infra

- GCS media when `GS_BUCKET_NAME` set; local `MEDIA_ROOT` otherwise. Cloud Run FS is ephemeral.
- Dockerfile: `migrate --noinput && exec gunicorn` — `exec` required so signals reach gunicorn.
- `CONN_MAX_AGE=0`, gunicorn `--threads 2` (db-f1-micro 25-conn limit).
- Moderation cron: Cloud Scheduler `*/10 * * * *` → `POST /api/admin/run-moderation/` with `X-Moderation-Secret`.

---

## Security / Privacy

- Use `logger = logging.getLogger(__name__)`, never `print()`.
- `start_local.md` is gitignored — **never** record, commit, or include its contents anywhere.

---

## Work Style

1. Show thinking & assumptions before acting.
2. List execution plan before file changes; wait for go-ahead.
3. Explain *why* each change (problem/requirement), not what it does.
