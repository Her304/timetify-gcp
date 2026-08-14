# Commands

**Frontend:** `npm run dev` (5173), `npm run build`, `npm run lint`. **Backend:** `python manage.py runserver` (8000), `migrate`, `makemigrations`.

`npm run build` is `vite build` **plus** `scripts/prerender.mjs`, which fetches published blog posts from `VITE_API_URL` and writes per-route static `<head>`s (see [SEO](seo.md)). Use `npm run build:only` to skip prerendering. Note `npm run dev` serves no prerendered files — extensionless routes fall back to the SPA shell, so per-route metadata in dev comes from the runtime `<Seo>` component only.
