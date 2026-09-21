# Commands

**Frontend:** `npm run dev` (5173), `npm run build`, `npm run lint`. **Backend:** `python manage.py runserver` (8000), `migrate`, `makemigrations`.

**Tests (committed suite, offline — no API key/Postgres/email needed):** from `backend/`, `DEBUG=True BACK_SENTRY_DSN= python manage.py test main.tests --settings=backend.test_settings`. CI runs the same plus a frontend build (`.github/workflows/ci.yml`).

`npm run build` is `vite build` **plus** `scripts/prerender.mjs`, which fetches published blog posts from `VITE_API_URL` and writes per-route static `<head>`s (see [SEO](seo.md)). Use `npm run build:only` to skip prerendering. Note `npm run dev` serves no prerendered files — extensionless routes fall back to the SPA shell, so per-route metadata in dev comes from the runtime `<Seo>` component only.
