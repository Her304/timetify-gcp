# Deploy / Infra

GCS media when `GS_BUCKET_NAME` set; local `MEDIA_ROOT` otherwise. Cloud Run FS is ephemeral. Dockerfile: `migrate --noinput && exec gunicorn` (`exec` so signals reach gunicorn). `CONN_MAX_AGE=0`, gunicorn `--threads 2`. Moderation cron: Cloud Scheduler `*/10 * * * *` → `POST /api/admin/run-moderation/` with `X-Moderation-Secret`.

**Two Cloud Run services.** Backend (`timetify-web-…`) is Django/gunicorn; frontend (`timetify-gcp-frontend-…`) is nginx serving the Vite build. `VITE_API_URL` comes from the tracked `frontend/.env.production`, not a build arg.

Frontend nginx config is `frontend/nginx.conf.template`, rendered by the image's envsubst entrypoint from `${PORT}` (Cloud Run) and `${BACKEND_HOST}` (the origin `/sitemap.xml` proxies to — update it if the backend service is renamed, or the proxy 502s). This replaced the old `sed`-the-port-at-runtime hack. It also 301s the `*.run.app` hostnames to `timetify.net`, so testing a deploy on its raw Cloud Run URL will bounce you to production — hit the custom domain, or check `Host`-specific behaviour with an explicit header. Full rules in [SEO](seo.md).
