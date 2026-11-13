# Claude DB monitor

A Claude Code scheduled task ("timetify DB monitor") runs daily in Anthropic's
cloud — no laptop or CLI needed — executes `check.sh`, and posts a short report
as a session in claude.ai/code (Code tab in the Claude mobile app). It is
**read-only**; the Cloud SQL export/stop/delete is done by the Cloud Run Job in
`../cloudsql-decommission/`.

| | Runs where | Can change things? |
|---|---|---|
| `cloudsql-decommission` job, 09:00 Toronto | your GCP project | yes, gated by health checks |
| Claude DB monitor, 10:00 Toronto | Anthropic cloud | no — viewer key + Neon read via proxy |

## One-time setup

1. **GCP job** (if not done): `bash ops/cloudsql-decommission/setup.sh`
2. **Viewer key:** `bash ops/db-monitor/setup-viewer.sh` — prints `GCP_MONITOR_KEY_B64=…`.
3. **Neon API key** (project-scoped), in your own terminal:
   `neonctl api-keys create --name claude-db-monitor --project-id silent-lake-62023841`
4. **Claude cloud environment** — claude.ai/code → environments → **New**, name `timetify-monitor`:
   - **Network access:** Limited, *Allow package managers* on, extra allowed domains:
     `dl.google.com`, `timetify.net`, `timetify-web-931972332433.us-central1.run.app`, `console.neon.tech`
   - **Environment variables:** the `GCP_MONITOR_KEY_B64=…` line from step 2
   - **Network secret:** host `console.neon.tech`, value = Neon key from step 3 (Bearer)
   - **Setup script:**
     ```bash
     curl -sSL https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz \
       | tar -xz -C /opt && /opt/google-cloud-sdk/install.sh -q --path-update false \
       && ln -sf /opt/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud || true
     ```
5. Point the scheduled task at the `timetify-monitor` environment (claude.ai/code/routines → task → edit).

## Running locally

`MONITOR_USE_AMBIENT_GCLOUD=1 NEON_VIA_NEONCTL=1 bash ops/db-monitor/check.sh`
reuses your own `gcloud` and `neonctl` logins.

## Rotating / revoking

- GCP: `gcloud iam service-accounts keys list --iam-account db-monitor-viewer@timetify-prod.iam.gserviceaccount.com`, then `keys delete`.
- Neon: `neonctl api-keys list` / `neonctl api-keys revoke <id>`.
- Retire the monitor: delete the scheduled task, the environment, and the `db-monitor-viewer` service account.
