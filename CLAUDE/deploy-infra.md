# Deploy / Infra

GCS media when `GS_BUCKET_NAME` set; local `MEDIA_ROOT` otherwise. Cloud Run FS is ephemeral. Dockerfile: `migrate --noinput && exec gunicorn` (`exec` so signals reach gunicorn). `CONN_MAX_AGE=0`, gunicorn `--threads 2`. Moderation cron: Cloud Scheduler `*/10 * * * *` → `POST /api/admin/run-moderation/` with `X-Moderation-Secret`.

**Two Cloud Run services.** Backend (`timetify-web-…`) is Django/gunicorn; frontend (`timetify-gcp-frontend-…`) is nginx serving the Vite build. `VITE_API_URL` comes from the tracked `frontend/.env.production`, not a build arg.

Frontend nginx config is `frontend/nginx.conf.template`, rendered by the image's envsubst entrypoint from `${PORT}` (Cloud Run) and `${BACKEND_HOST}` (the origin `/sitemap.xml` proxies to — update it if the backend service is renamed, or the proxy 502s). This replaced the old `sed`-the-port-at-runtime hack. It also 301s the `*.run.app` hostnames to `timetify.net`, so testing a deploy on its raw Cloud Run URL will bounce you to production — hit the custom domain, or check `Host`-specific behaviour with an explicit header. Full rules in [SEO](seo.md).

**nginx `add_header` inheritance.** A `location` that declares *any* `add_header` silently drops every server-level one — which previously would have removed the CSP and HSTS headers from exactly the HTML responses that need them. The document locations therefore use `expires -1` instead of `add_header Cache-Control`; the asset locations, which do need `add_header` for `immutable`, repeat `X-Content-Type-Options` explicitly. Adding an `add_header` to a location means re-adding the security headers there too.

## Signed media URLs (post-pentest)

Media is served through **signed, expiring URLs** (`main/storage.py`, `SignedGoogleCloudStorage`), not a public bucket. Two things must be true in the environment or media breaks:

1. **The bucket must not be public.** `gsutil iam ch -d allUsers:objectViewer gs://$GS_BUCKET_NAME`. Leaving the binding in place is not merely redundant — it re-opens anonymous `storage.objects.list`, so the whole bucket stays enumerable regardless of signing.
2. **The runtime service account must be able to sign via the IAM API.** django-storages (≤1.14.6) signs with a local private key, which Cloud Run's metadata credentials do not have; `SignedGoogleCloudStorage` instead signs through IAM `signBlob`, which needs the SA to hold `roles/iam.serviceAccountTokenCreator` **on itself**:

   ```
   gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
       --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountTokenCreator"
   ```

If signing fails the backend logs `gcs.signing_failed` at ERROR and falls back to an unsigned URL, so a missing binding degrades instead of 500ing — but that fallback only *works* while the bucket is still public. Treat that log line as "the fix is not actually deployed". URL lifetime is `GS_URL_EXPIRY_SECONDS` (default 2h).

## Other security-relevant env vars

- `ADMIN_URL_PATH` — moves the Django admin off `/admin/`. Set it to something unguessable in prod.
- `TRUSTED_PROXY_COUNT` — how many proxies append to `X-Forwarded-For` (default 1, correct for Cloud Run direct). Rate limiting derives the client IP from the *rightmost* N entries, because everything left of them is caller-supplied and forgeable. Raise it if a load balancer is put in front, or per-IP throttling will key on the proxy and limit all users as one.
- `REDIS_URL` — optional. Throttle counters live in the cache; without Redis they fall back to a database cache table (created by migration `0035`). Do **not** let this fall back to a per-process LocMemCache: each Cloud Run instance would get its own budget.
- `THROTTLE_*` — per-endpoint rate overrides; see `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`.

**Migration `0034` can fail on existing data.** It adds case-insensitive unique constraints on username and email. Run `python manage.py find_identity_collisions` first; it lists colliding accounts and exits non-zero, so it can gate the deploy.
