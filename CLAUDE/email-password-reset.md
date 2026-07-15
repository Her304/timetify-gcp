# Email & Password Reset

- Resend via Anymail (`EMAIL_BACKEND`). Sender split: `DEFAULT_FROM_EMAIL`/`MODERATION_FROM_EMAIL` = `report@timetify.net`; `WELCOME_FROM_EMAIL` = `hello@timetify.net`.
- Branded HTML templates in `backend/templates/emails/`: `layout.html` (shared shell) → `welcome.html` (sent from `RegisterView` via `main/account_email.py`) and `transactional.html` (generic; wired into every `moderation_email.py` send via `_send()`). Brand: coral `#ED6A4A` / lilac `#C8B0DF` / lime `#C9EE6F`, ink/cream/paper, Bricolage Grotesque + Geist + Geist Mono — matches `Landing.jsx`, not the old `#607196` palette.
- `registration/password_reset_*.html` (request/done/confirm/complete pages) restyled to the same brand.
- **`CANONICAL_DOMAIN`** setting + `CustomPasswordResetForm.save()` (`main/forms.py`) force the emailed reset link to `timetify.net` — not whichever Cloud Run hostname the request hit — whenever `DEBUG=False`; local dev links still follow the request host.
