#!/usr/bin/env bash
# Creates the VIEW-ONLY service account the Claude DB monitor uses, and prints
# its key as a single base64 line for the Claude cloud environment.
#
#   bash ops/db-monitor/setup-viewer.sh
#
# Run after ops/cloudsql-decommission/setup.sh (it reads that job's bucket).
# Every role here is a viewer role: a leaked key can read status, not change it.
set -uo pipefail
P=timetify-prod
R=us-central1
SA=db-monitor-viewer@$P.iam.gserviceaccount.com
KEY=$(mktemp)
trap 'rm -f "$KEY"' EXIT

gcloud iam service-accounts create db-monitor-viewer --project $P \
  --display-name "Claude DB monitor (read-only)" -q 2>/dev/null && sleep 10 || true

for r in roles/cloudsql.viewer roles/run.viewer roles/logging.viewer; do
  gcloud projects add-iam-policy-binding $P --member "serviceAccount:$SA" --role $r --condition=None -q >/dev/null && echo "  ✓ $r"
done
gcloud storage buckets add-iam-policy-binding gs://timetify-prod-ops --member "serviceAccount:$SA" \
  --role roles/storage.objectViewer -q >/dev/null && echo "  ✓ objectViewer on gs://timetify-prod-ops"

gcloud iam service-accounts keys create "$KEY" --iam-account $SA --project $P -q >/dev/null
echo
echo "Paste this as the value of GCP_MONITOR_KEY_B64 in the Claude cloud environment"
echo "(claude.ai/code → environment settings → environment variables), then clear your terminal:"
echo
echo "GCP_MONITOR_KEY_B64=$(base64 < "$KEY" | tr -d '\n')"
