#!/usr/bin/env bash
# One-time setup for the daily Cloud SQL decommission / health-check job.
# Safe to re-run: every create step tolerates "already exists".
#
#   bash ops/cloudsql-decommission/setup.sh
#
# Creates, in timetify-prod:
#   - gs://timetify-prod-ops          private bucket: script, state.json, final export
#   - decommission-bot SA             the job's identity (least privilege below)
#   - CLAUDE_ROUTINE_TOKEN / _FIRE_URL secrets, value "unset" until you add real ones
#   - Cloud Run Job cloudsql-decommission (google-cloud-cli image, runs decommission.sh)
#   - Cloud Scheduler job cloudsql-decommission-daily (09:00 America/Toronto)
set -uo pipefail
P=timetify-prod
R=us-central1
SA=decommission-bot@$P.iam.gserviceaccount.com
RUNTIME_SA=931972332433-compute@developer.gserviceaccount.com      # timetify-web's runtime SA
SQL_SA=$(gcloud sql instances describe timetify-gcp-v2 --project $P --format='value(serviceAccountEmailAddress)')
B=gs://timetify-prod-ops
HERE=$(cd "$(dirname "$0")" && pwd)
ok() { echo "  ✓ $*"; }

echo "== bucket"
gcloud storage buckets create $B --project $P --location $R \
  --uniform-bucket-level-access --public-access-prevention -q 2>/dev/null && ok created || ok exists

echo "== service account"
gcloud iam service-accounts create decommission-bot --project $P \
  --display-name "Cloud SQL decommission + daily health check" -q 2>/dev/null && { ok created; sleep 10; } || ok exists

echo "== permissions"
# Job state, script and the final export live in the ops bucket. Cloud SQL's
# own service agent is what actually writes an export, so it needs the bucket too.
gcloud storage buckets add-iam-policy-binding $B --member "serviceAccount:$SA"     --role roles/storage.objectAdmin -q >/dev/null && ok "bot: objectAdmin on $B"
gcloud storage buckets add-iam-policy-binding $B --member "serviceAccount:$SQL_SA" --role roles/storage.objectAdmin -q >/dev/null && ok "Cloud SQL agent: objectAdmin on $B"
# Export / stop / delete the instance. Cloud SQL has no per-instance IAM, so
# this is project-level — the one broad grant here.
gcloud projects add-iam-policy-binding $P --member "serviceAccount:$SA" --role roles/cloudsql.admin --condition=None -q >/dev/null && ok "bot: cloudsql.admin (project)"
# Read Cloud Run request logs for the daily 5xx count.
gcloud projects add-iam-policy-binding $P --member "serviceAccount:$SA" --role roles/logging.viewer --condition=None -q >/dev/null && ok "bot: logging.viewer (project)"
# Update ONLY timetify-web (detach Cloud SQL, roll traffic back if unhealthy).
gcloud run services add-iam-policy-binding timetify-web --project $P --region $R --member "serviceAccount:$SA" --role roles/run.developer -q >/dev/null && ok "bot: run.developer on timetify-web only"
# Deploying a revision requires actAs on the service's runtime SA.
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA --project $P --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser -q >/dev/null && ok "bot: actAs $RUNTIME_SA"
# Delete DB_PASS at the very end.
gcloud secrets add-iam-policy-binding DB_PASS --project $P --member "serviceAccount:$SA" --role roles/secretmanager.admin -q >/dev/null && ok "bot: admin on secret DB_PASS only"

echo "== Claude notifier secrets (placeholders)"
for s in CLAUDE_ROUTINE_TOKEN CLAUDE_ROUTINE_FIRE_URL; do
  printf unset | gcloud secrets create $s --project $P --replication-policy automatic --data-file=- -q 2>/dev/null && ok "$s created" || ok "$s exists"
  gcloud secrets add-iam-policy-binding $s --project $P --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor -q >/dev/null
done

echo "== script"
gcloud storage cp "$HERE/decommission.sh" $B/decommission/decommission.sh -q && ok uploaded

echo "== Cloud Run Job"
JOB_ARGS=(--project $P --region $R
  --image gcr.io/google.com/cloudsdktool/google-cloud-cli:slim
  --service-account $SA
  --command bash
  --args="-c,gcloud storage cat $B/decommission/decommission.sh > /tmp/d.sh && exec bash /tmp/d.sh"
  --set-secrets CLAUDE_ROUTINE_TOKEN=CLAUDE_ROUTINE_TOKEN:latest,CLAUDE_ROUTINE_FIRE_URL=CLAUDE_ROUTINE_FIRE_URL:latest
  --max-retries 0 --task-timeout 1800 --memory 1Gi -q)
gcloud run jobs create cloudsql-decommission "${JOB_ARGS[@]}" 2>/dev/null && ok created \
  || { gcloud run jobs update cloudsql-decommission "${JOB_ARGS[@]}" >/dev/null && ok updated; }
# Scheduler triggers the job as the bot, so the bot may run (only) this job.
gcloud run jobs add-iam-policy-binding cloudsql-decommission --project $P --region $R --member "serviceAccount:$SA" --role roles/run.invoker -q >/dev/null && ok "bot: run.invoker on this job only"

echo "== daily schedule"
gcloud scheduler jobs create http cloudsql-decommission-daily --project $P --location $R \
  --schedule "0 9 * * *" --time-zone America/Toronto --http-method POST \
  --uri "https://run.googleapis.com/v2/projects/$P/locations/$R/jobs/cloudsql-decommission:run" \
  --oauth-service-account-email $SA -q 2>/dev/null && ok "created (09:00 Toronto daily)" || ok exists

echo
echo "Setup done. First run (health check only — nothing destructive before 2026-11-15):"
echo "  gcloud run jobs execute cloudsql-decommission --project $P --region $R --wait"
