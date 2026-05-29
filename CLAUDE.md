# CLAUDE.md

> **Keep this file under 500 words.** Summarise; don't exhaustively document. Read code for details.

## Commands

**Frontend:** `npm run dev` (5173), `npm run build`, `npm run lint`. **Backend:** `python manage.py runserver` (8000), `migrate`, `makemigrations`.

## Stack

`frontend/` React + Vite + Tailwind · `backend/` Django, single `main/` app. State lives in `App.jsx` → props; `AppShell` wraps router. JWT in localStorage via `authenticatedFetch`. React Router v6; `/feed` and `/chat/:roomId` protected. Body bg `cream` when logged in.

## Brand

Atoms in `@/components/shared/brand`: `T`, `FF`, `Avatar`/`ProfileAvatar`, `PillBtn`, `MonoLabel`, `Chip`, `Toggle`, `Icon`, `AppMark`. Colors: coral `#ED6A4A`, lilac `#C8B0DF`, lime `#C9EE6F`, ink `#1F1A22`, cream `#F8F4ED`. Fonts: Bricolage Grotesque (display), Geist (body), Geist Mono (labels). Tone: low-caps, casual. `ProfileAvatar` falls back to `Avatar` initials when `profile_picture_url` is null — use everywhere an avatar shows.

## Navigation

Desktop `header-nav-app.jsx` (sticky; bell → `NotificationsPanel`; avatar → `/profile`). Mobile `mobile-top-bar.jsx` + `mobile-bottom-nav.jsx`, hidden on `/chat/<id>` — add `pb-24` to scrollable pages. Unread badge: `AppShell` polls `/api/chats/unread/` every 30 s.

## Key Gotchas

- **Feed `friendsList`** items are friendship rows — flatten via `.map(f => f.friend_details).filter(Boolean)`.
- **Chat list** is `flex flex-col-reverse` over DESC array (index 0 = newest at bottom).
- **Snap expiry**: `expires_at` is the display cliff (midnight next day); GCS blob purged at 30 days. `is_removed` is moderation/user-only — natural expiry does **not** set it.
- **Camera release**: `onClose` must call `window.location.reload()` after clearing course or Chrome's camera indicator stays stuck.
- **Snap `group` visibility** accepts `group_id` **or** `chat_room_id`, intersected with accepted friends.
- **Course overlap guard** is strict `<` only; 10:00-end / 10:00-start touch is allowed.
- **Groups + UserBlock**: blocks don't prevent sends — blocked-user messages are filtered on every read path.
- **Profile picture**: frontend downscales ≤1024 px + JPEG @ 0.7; backend re-validates ext/magic-bytes/5 MB and deletes the previous file on replace. `profile_picture` is write-only; clients read `profile_picture_url`.
- **Feed is modular**: `components/feed/feed.jsx` is the orchestrator; sections in `AvatarRow`, `ChatSearch`, `GroupChatList`, `DmInboxList`, `CoursePickerModal`, `FilterChip`; hooks in `feed/hooks/`; helpers in `feed/utils.js`.

## Models (non-obvious)

`Snap.visibility` ∈ `all_friends|selected|group`, plus `is_removed`, `expires_at`. `ChatRoomMember.is_admin` gates group rename/add/remove; oldest member auto-promoted when last admin leaves. `Message.replied_snap` SET_NULL on Snap delete; soft-delete retains `content`. `FunctionRestriction.restriction_type` ∈ `snap_posting|chat_messaging|both`; `expires_at` null = permanent. `ReparseLog`: one row per AI-reparse attempt; backs the 3 / 24 h cap.

## AI course parse (`backend/main/pdf.py`)

- Default model **`gpt-5-mini`**. PDFs go to OpenAI **Files API** (native PDF input scored 12/13 vs 6/13 for pre-extracted text). `.docx` still uses pdfplumber/python-docx + text prompt.
- Schema returns `None` for fields the syllabus doesn't state (`classroom`, `start_time`/`end_time`, `rep_date`, exam/assignment dates) — never fabricate. Dates are `datetime.date`, so range strings fail validation.
- **`rep_date` multi-day** is comma-separated, e.g. `"Tuesday,Thursday"` (one course, same time both days). `_parse_rep_days()` splits on comma. Emit a `-TH` secondary course only when the other day has a *different* time.
- **Reparse cap** = 3 / 24 h / user. Set `is_reparse=true` on `/api/courses/analyze/`; first analyze is free. Response carries `reparse_remaining`.
- **Add page** (`components/add/add.jsx`): missing critical fields → callout + *confirm & save* disabled. Finalize `{error:"overlap", a, b, day}` triggers `viewState="overlap"` — dedicated conflict screen, `source: incoming|existing` on each card, drop/back actions.

## Deploy / Infra

GCS media when `GS_BUCKET_NAME` set; local `MEDIA_ROOT` otherwise. Cloud Run FS is ephemeral. Dockerfile: `migrate --noinput && exec gunicorn` (`exec` so signals reach gunicorn). `CONN_MAX_AGE=0`, gunicorn `--threads 2`. Moderation cron: Cloud Scheduler `*/10 * * * *` → `POST /api/admin/run-moderation/` with `X-Moderation-Secret`.

## Security / Work Style

Use `logger = logging.getLogger(__name__)`, never `print()`. `start_local.md` is gitignored — never record/commit/include its contents. Work style: show thinking before acting, list a plan before file changes and wait for go-ahead, explain *why* (problem/requirement) not *what*.
