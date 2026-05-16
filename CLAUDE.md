# CLAUDE.md

**Frontend:** `npm run dev` (port 5173), `npm run build`, `npm run lint`
**Backend:** `python manage.py runserver` (port 8000), `migrate`, `makemigrations`

## Architecture

**Layout:** `frontend/` (React+Vite+Tailwind), `backend/` (Django); single `main/` app
**State:** All in `App.jsx`, passed as props. React Router v6 with `ProtectedRoute`.
**Auth:** JWT in localStorage, auto-refresh via `authenticatedFetch`. Password reset via Django's `PasswordResetView` at `/password_reset/`.
**Course upload:** `add.jsx` → `/api/courses/analyze/` → GPT-4o-mini parsing → `/api/courses/finalize/` persists. **Constraints:** 5MB max, `.pdf`/`.docx` only, magic-byte check, server-generated filename. Keep all four checks if editing; `pdf.extract_text` raises on unknown extensions.
**Snap:** `home/snap.jsx` renders a two-block grid — left "Today" lists all classes (personal + friend) as white cards with brand-blue avatars (white initial of `currentUser.username` / friend username) and a yellow `LIVE` chip when current time ∈ `[start_time, end_time]`; right "Snaps" is a flex-wrap row of `w-16` round tiles — first an "add" tile (brand-blue circle with inline `ArOnYouIcon` SVG + yellow `+` badge, label always reads `snap now!`), then one tile per uploader (uniform brand-blue bg, white initial, yellow ring `ring-2 ring-[#ffc759] ring-offset-2 ring-offset-[#e8e9ed]`; no count badge). Add-tile click: 0 own courses → noop, 1 → straight to capture, >1 → course-picker modal. → `snap/SnapCaptureModal.jsx` (header title is dynamic: `snap <course code>` if current time falls inside the picked course's window via `isLiveNow`, else `snap now`; in-browser camera, `getUserMedia` 1080×1350, photo via canvas JPEG q=0.85, video via `MediaRecorder` 5s hard cap; mp4 on Safari, webm on Chrome — backend accepts both) → `POST /api/snaps/` (multipart). **Camera release:** parent's `onClose` runs `window.location.reload()` after `setCaptureCourse(null)` — relying on the React unmount cleanup alone left Chrome's camera indicator stuck. Feed: `GET /api/snaps/feed/` returns `snaps_by_course` keyed by Course PK. Mark viewed: `POST /api/snaps/<id>/view/`. Uploader soft-delete: `DELETE /api/snaps/<id>/`. **Viewer (`SnapViewerModal`):** receives `prevTile`/`nextTile`/`onSelectPrev`/`onSelectNext`/`onAdd` from `snap.jsx` (parent tracks `viewerTileIdx` into `tiles`); renders side avatars absolutely-positioned on the backdrop — left = previous uploader (or the add icon if at the first tile, which closes the viewer and runs `handleAddClick`), right = next uploader. Internal `‹ ›` arrows still page within one uploader's snaps; `useEffect([snaps])` resets `idx` to 0 when switching uploaders. Header subline appends `· snap from <course>` when the snap's `created_at` HH:MM is inside that course's class window. **Constraints:** 20MB max, allowed types `image/jpeg|png` + `video/mp4|quicktime|webm`, magic-byte check, server-generated path `snaps/<user_id>/<uuid>.<ext>`, **4:5 portrait** (`TARGET_RATIO = 4/5`, both modal preview and viewer use `aspect-[4/5]`), **caption max 50 words** (server splits on whitespace + slices). Visibility: `'all_friends'` (no audience rows; feed joins through current `Friend` table — late-added friends can view) or `'selected'` (per-friend `SnapAudience` rows as allowlist). `SnapAudience` doubles as the view-tracker, lazy-created on first view for `all_friends`. `expires_at` = midnight of next day in the **user's IANA TZ** (browser sends `timezone` field; backend uses `zoneinfo`). **No** restriction-check on upload yet (lives in plan Phase 6/7). Schedule endpoint (`home()`) emits `id` (Course PK) per entry so the frontend can key snaps to cards.

**Layout:** Sidebar `hidden md:flex`; mobile nav `md:hidden`; outer div `md:flex-row flex-col`.
**Colors:** `#607196` (main), `#e8e9ed` (secondary), `#ffc759` (accent). Tailwind: `brand`, `brand-secondary`, `brand-accent`. No `rounded-*` except `rounded-full`.
**Fonts:** DM Serif Text (headings, use inline `style={{ fontFamily: "'DM Serif Text', serif" }}`); Figtree (default UI text). Both in `tailwind.config.js`.

**Models:** `Course` (slots, assignments, exams), `FriendRequest`/`Friendship`, Custom `User` (university, major, grad_year), `Snap` (uploader/course FK, media_file, media_type, caption, visibility, is_removed, expires_at) + `SnapAudience` (snap/viewer FK, has_viewed, viewed_at — unique_together).
**Storage:** Media via `django-storages[google]`. `STORAGES["default"]` toggles to `GoogleCloudStorage` when `GS_BUCKET_NAME` env is set (public URLs, `querystring_auth=False`, IAM-based ACL — bucket should grant `allUsers:objectViewer` for read). Unset locally → falls back to `MEDIA_ROOT`. Cloud Run FS is ephemeral; **prod must have `GS_BUCKET_NAME`**.
**Deploy:** Dockerfile `CMD` runs `python manage.py migrate --noinput && exec gunicorn …` so each new revision self-applies migrations on cold-start. `exec` matters — signals must reach gunicorn.
**External:** OpenAI (GPT-4o-mini, `OPENAI_API_KEY`), Resend (email), Sentry (errors), Cloud SQL (Postgres), Cloud Run (deploy), AdSense (`ca-pub-9825491172037028`, push in `useEffect`, needs `ads.txt`).
**Error UX:** Backend/server errors trigger a bottom-right toast (`ErrorToast.jsx`) via the `server-error` window event and `isErrorReportModalOpen` state in `App.jsx`. Toast auto-dismisses after 8s; links to `help@timetify.net`. No modal — do not reintroduce `ErrorReportModal`.

## Security

**Prod settings:** `SECRET_KEY` required (no `django-insecure-`), `SECURE_*`/HSTS/`SECURE_PROXY_SSL_HEADER` auto-enabled. `CORS_ALLOWED_ORIGINS` & `CSRF_TRUSTED_ORIGINS` are explicit allowlists; `ALLOWED_HOSTS` doesn't auto-expand.
**API:** `UserSerializer` read-only: `['id', 'username', 'email', 'status']` — don't loosen without email verification. `SearchFriend` username-only (no email search).
**Logging:** Use `logger = logging.getLogger(__name__)`, never `print()` — `send_default_pii=True` leaks data to Sentry.

## Privacy

`start_local.md` is gitignored and local-only. **Never** record, memorize, save to memory files, or include any content from `start_local.md` in responses, commits, or any other persistence mechanism.

## Work Style

1. Show thinking & assumptions before acting
2. List execution plan before file changes; wait for go-ahead
3. Explain *why* each change (problem/requirement), not what it does
