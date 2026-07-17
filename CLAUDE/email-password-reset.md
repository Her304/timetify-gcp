# Email & Password Reset

- Resend via Anymail (`EMAIL_BACKEND`). Sender split: `DEFAULT_FROM_EMAIL`/`MODERATION_FROM_EMAIL` = `report@timetify.net`; `WELCOME_FROM_EMAIL` = `hello@timetify.net`.
- Branded HTML templates in `backend/templates/emails/`: `layout.html` (shared shell) → `welcome.html` (sent from `RegisterView` via `main/account_email.py`) and `transactional.html` (generic; wired into every `moderation_email.py` send via `_send()`). Brand: coral `#ED6A4A` / lilac `#C8B0DF` / lime `#C9EE6F`, ink/cream/paper, Bricolage Grotesque + Geist + Geist Mono — matches `Landing.jsx`, not the old `#607196` palette.
- Password reset is a React flow (`/reset-password`, `/reset-password/:uid/:token` — `ForgotPassword.jsx` / `ResetPasswordConfirm.jsx`) backed by JSON endpoints (`api/password-reset/`, `api/password-reset/confirm/<uidb64>/<token>/` in `main/views.py`), not Django server-rendered pages — keeps the whole flow on `timetify.net` instead of full-navigating to the backend's Cloud Run hostname.
- `registration/password_reset_email.html`/`.txt` (the emailed link only) are still Django templates, rendered directly by `send_password_reset_email()` (`main/account_email.py`).
- **`build_password_reset_link()`** (`main/account_email.py`) builds the emailed link from `CANONICAL_DOMAIN` (prod, `DEBUG=False`) or `FRONTEND_URL` (local dev) — never whichever Cloud Run hostname the request hit — pointed at the React confirm route.

## Account edits (username / email) — profile page

Both edited from `profile.jsx` ("settings & such"). Different trust models:

- **Username** — editable, applied immediately (no verification). Writable in `UserSerializer`; `validate_username` reuses `AbstractUser`'s format validators and enforces **case-insensitive uniqueness excluding self** (`username__iexact`, mirroring login). Sent via the normal `PATCH /api/user/`; JWTs are keyed by user id so a rename doesn't invalidate sessions. On a real change, `UserSerializer.update` fires a **best-effort security heads-up** email to the account's confirmed `user.email` (`send_username_change_notification()` in `main/account_email.py`, template `emails/username_changed.html`) — old→new name plus a reset-password nudge in case the rename wasn't the owner. Failures log, never block the PATCH.
- **Email** — `read_only` in `UserSerializer`; changing it requires verifying the **new** address:
  - `POST /api/user/change-email/` (`ChangeEmailRequestView`) validates (valid / differs / not taken case-insensitively), stages the value in the new `CustomUser.pending_email` field, and emails a signed token to the **new** address. Live `email` is untouched. **No password re-auth** — control of the new inbox is the gate.
  - Token: `django.core.signing.dumps({uid, email}, salt='email-change')`, 24h max-age — carries identity + target so no DB token row is needed and a tampered link can't retarget. Link built with `CANONICAL_DOMAIN` in prod (same rule as reset), request host in `DEBUG`.
  - `GET /verify-email/<token>/` (`verify_email_change`, `AllowAny`, **server-rendered** — user may open it on another device) re-checks uniqueness at confirm time, then applies `pending_email → email`. Pages: `emails/email_change_verification.html` (the email) + `registration/email_change_result.html` (the landing).
  - Helper: `send_email_change_verification()` in `main/account_email.py`. Frontend shows a "verification link sent" banner and a `pending_email` hint until confirmed.
