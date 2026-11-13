#!/usr/bin/env bash
# Daily Cloud SQL decommission + production health check.
#
# Runs as Cloud Run Job `cloudsql-decommission` (image: google-cloud-cli:slim),
# triggered once a day by Cloud Scheduler. The job fetches this file from
# gs://timetify-prod-ops/decommission/decommission.sh, so edit it here and
# re-upload (see README.md next to it).
#
# Every run: health-check production. Destructive phases only advance when
# every check is green AND enough consecutive healthy days have accumulated;
# any red check resets the streak and blocks them.
#
#   monitor  --(>= STOP_AFTER, streak >= 2)-->  export + verify, then stop   -> stopped
#   stopped  --(>= DELETE_AFTER, 5 healthy days since stop)-->
#            detach Cloud SQL from timetify-web, re-verify, delete instance,
#            delete DB_PASS secret                                           -> deleted
#   deleted  --> health check only, forever
set -euo pipefail

PROJECT=timetify-prod
REGION=us-central1
INSTANCE=timetify-gcp-v2
SERVICE=timetify-web
BUCKET=gs://timetify-prod-ops
STATE_URI=$BUCKET/decommission/state.json
SITE=https://timetify.net
API=https://timetify-web-931972332433.us-central1.run.app
STOP_AFTER=${STOP_AFTER:-2026-11-15}
DELETE_AFTER=${DELETE_AFTER:-2026-11-20}
AUTO_DELETE=${AUTO_DELETE:-true}
MAX_5XX_24H=${MAX_5XX_24H:-20}
TODAY=$(TZ=America/Toronto date +%F)

log() { echo "[decommission] $*"; }

# --- notification ----------------------------------------------------------
# Fires the Claude scheduled task "timetify ops" via its API trigger; each fire
# opens a session in claude.ai/code (and the Claude mobile app's Code tab).
# CLAUDE_ROUTINE_FIRE_URL / CLAUDE_ROUTINE_TOKEN come from Secret Manager; while
# either is still the placeholder "unset", notifications only go to the log.
# Never fails the job: a notification outage must not block or fake a phase.
notify() {  # notify <level: info|alert> <subject> <body>
  log "NOTIFY[$1] $2 :: $3"
  local url=${CLAUDE_ROUTINE_FIRE_URL:-unset} tok=${CLAUDE_ROUTINE_TOKEN:-unset}
  [ "$url" = unset ] || [ "$tok" = unset ] && return 0
  local body
  body=$(python3 -c 'import json,sys; print(json.dumps({"text": "[%s] %s\n\n%s" % tuple(sys.argv[1:4])}))' "$1" "$2" "$3")
  curl -s -m 30 -o /dev/null -w '[decommission] notify -> HTTP %{http_code}\n' -X POST "$url" \
    -H "Authorization: Bearer $tok" -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: experimental-cc-routine-2026-04-01" -H "Content-Type: application/json" \
    -d "$body" || log "notify failed (ignored)"
}

# --- state -----------------------------------------------------------------
STATE=$(gcloud storage cat "$STATE_URI" 2>/dev/null || echo '{}')
st() { python3 -c 'import json,sys; v=json.loads(sys.argv[1]).get(sys.argv[2]); print("" if v is None else v)' "$STATE" "$1"; }
st_set() {  # st_set key value [key value ...]
  STATE=$(python3 - "$STATE" "$@" <<'EOF'
import json,sys
s=json.loads(sys.argv[1]); a=sys.argv[2:]
for k,v in zip(a[::2],a[1::2]):
    s[k]=int(v) if v.isdigit() else v
print(json.dumps(s))
EOF
)
}
save_state() { printf '%s' "$STATE" | gcloud storage cp - "$STATE_URI" --quiet >/dev/null; }

PHASE=$(st phase); PHASE=${PHASE:-monitor}
STREAK=$(st healthy_streak); STREAK=${STREAK:-0}
STREAK_SINCE_STOP=$(st healthy_since_stop); STREAK_SINCE_STOP=${STREAK_SINCE_STOP:-0}

# --- health checks ---------------------------------------------------------
FAILS=()
code() { curl -s -o /dev/null -m 30 -w '%{http_code}' "$@" || echo 000; }

c=$(code "$SITE/");                [ "$c" = 200 ] || FAILS+=("timetify.net/ -> $c")
c=$(code "$API/sitemap.xml");      [ "$c" = 200 ] || FAILS+=("backend /sitemap.xml (reads DB) -> $c")
c=$(code "$API/api/friends/");     [ "$c" = 401 ] || FAILS+=("backend /api/friends/ unauthenticated -> $c (want 401)")

# Production must still be on Neon. If someone rolled back to Cloud SQL, the
# old instance is live again and must not be stopped or deleted.
ENV_NAMES=$(gcloud run services describe $SERVICE --project $PROJECT --region $REGION \
  --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n')
grep -qx DATABASE_URL <<<"$ENV_NAMES" || FAILS+=("$SERVICE no longer has DATABASE_URL — possible rollback to Cloud SQL")

N5XX=$(gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND httpRequest.status>=500" \
  --project $PROJECT --freshness=1d --limit 500 --format='value(timestamp)' | wc -l | tr -d ' ')
[ "$N5XX" -le "$MAX_5XX_24H" ] || FAILS+=("$N5XX backend 5xx responses in 24h (limit $MAX_5XX_24H)")

INSTANCE_STATE=$(gcloud sql instances describe $INSTANCE --project $PROJECT \
  --format='value(state,settings.activationPolicy)' 2>/dev/null | tr '\t' ' ' || echo "GONE")

if [ ${#FAILS[@]} -gt 0 ]; then
  st_set healthy_streak 0 healthy_since_stop 0 last_check "$TODAY" last_result red
  save_state
  notify alert "timetify health check FAILED ($TODAY)" "$(printf -- '- %s\n' "${FAILS[@]}")
Phase: $PHASE. Destructive steps are on hold until checks are green again."
  exit 1
fi

# Count each calendar day at most once, so a manual re-run can't fast-forward.
if [ "$(st last_green_day)" != "$TODAY" ]; then
  STREAK=$((STREAK + 1))
  [ "$PHASE" = stopped ] && STREAK_SINCE_STOP=$((STREAK_SINCE_STOP + 1))
fi
st_set healthy_streak $STREAK healthy_since_stop $STREAK_SINCE_STOP last_check "$TODAY" last_green_day "$TODAY" last_result green
save_state
log "green: phase=$PHASE streak=$STREAK since_stop=$STREAK_SINCE_STOP instance='$INSTANCE_STATE' 5xx24h=$N5XX"

# One-time "it's wired up" message the first run after the Claude token is set.
if [ "${CLAUDE_ROUTINE_TOKEN:-unset}" != unset ] && [ "$(st setup_notified)" != yes ]; then
  notify info "timetify monitor connected" "Daily check is green (phase=$PHASE, healthy days=$STREAK, Cloud SQL: $INSTANCE_STATE). Export+stop from $STOP_AFTER after 2 healthy days; delete from $DELETE_AFTER after 5 healthy days since the stop (AUTO_DELETE=$AUTO_DELETE). You'll only hear from me on those events or a failed check."
  st_set setup_notified yes; save_state
fi

# --- phase: export + stop ---------------------------------------------------
if [ "$PHASE" = monitor ] && [[ "$TODAY" > "$STOP_AFTER" || "$TODAY" == "$STOP_AFTER" ]] && [ "$STREAK" -ge 2 ]; then
  EXPORT_URI="$BUCKET/cloudsql-final/timetify_db-$TODAY.sql.gz"
  log "exporting $INSTANCE -> $EXPORT_URI"
  gcloud sql export sql $INSTANCE "$EXPORT_URI" --database timetify_db --project $PROJECT --quiet
  SIZE=$(gcloud storage ls -l "$EXPORT_URI" | awk 'NR==1{print $1}')
  if [ "${SIZE:-0}" -lt 50000 ] || ! gcloud storage cat "$EXPORT_URI" | gunzip | grep -q 'CREATE TABLE public.main_customuser'; then
    notify alert "Cloud SQL export looks wrong — NOT stopping" "Export $EXPORT_URI is ${SIZE:-0} bytes or lacks main_customuser. Instance left running."
    exit 1
  fi
  gcloud sql instances patch $INSTANCE --activation-policy NEVER --project $PROJECT --quiet
  st_set phase stopped export_uri "$EXPORT_URI" export_bytes "$SIZE" stopped_on "$TODAY" healthy_since_stop 0
  save_state
  notify info "Cloud SQL exported and STOPPED" "Export: $EXPORT_URI ($SIZE bytes, verified). Instance $INSTANCE stopped (restart: gcloud sql instances patch $INSTANCE --activation-policy ALWAYS). Deletion eligible from $DELETE_AFTER after 5 healthy days."
  exit 0
fi

# --- phase: detach + delete -------------------------------------------------
if [ "$PHASE" = stopped ] && [[ "$TODAY" > "$DELETE_AFTER" || "$TODAY" == "$DELETE_AFTER" ]] && [ "$STREAK_SINCE_STOP" -ge 5 ]; then
  EXPORT_URI=$(st export_uri)
  gcloud storage ls "$EXPORT_URI" >/dev/null 2>&1 || { notify alert "Export missing — NOT deleting" "$EXPORT_URI not found."; exit 1; }

  if [ "$AUTO_DELETE" != true ]; then
    if [ "$(st delete_prompted)" != yes ]; then
      st_set delete_prompted yes; save_state
      notify info "Cloud SQL ready to delete" "All gates passed (export $EXPORT_URI verified, $STREAK_SINCE_STOP healthy days since stop). To delete: gcloud sql instances delete $INSTANCE --project $PROJECT"
    fi
    exit 0
  fi

  PREV_REV=$(gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format='value(status.latestReadyRevisionName)')
  log "detaching Cloud SQL from $SERVICE (current revision $PREV_REV)"
  RM_VARS=$(grep -E '^DB_(ENGINE|NAME|USER|HOST|PORT)$' <<<"$ENV_NAMES" | paste -sd, - || true)
  ARGS=(--clear-cloudsql-instances)
  [ -n "$RM_VARS" ] && ARGS+=(--remove-env-vars "$RM_VARS")
  grep -qx DB_PASS <<<"$ENV_NAMES" && ARGS+=(--remove-secrets DB_PASS)
  gcloud run services update $SERVICE --project $PROJECT --region $REGION "${ARGS[@]}" --quiet

  sleep 20
  c1=$(code "$API/sitemap.xml"); c2=$(code "$API/api/friends/")
  if [ "$c1" != 200 ] || [ "$c2" != 401 ]; then
    gcloud run services update-traffic $SERVICE --project $PROJECT --region $REGION --to-revisions "$PREV_REV=100" --quiet
    st_set healthy_since_stop 0; save_state
    notify alert "Detaching Cloud SQL broke $SERVICE — rolled back" "sitemap=$c1 friends=$c2 after the update; traffic returned to $PREV_REV. Instance NOT deleted."
    exit 1
  fi

  gcloud sql instances delete $INSTANCE --project $PROJECT --quiet
  gcloud secrets delete DB_PASS --project $PROJECT --quiet || true
  st_set phase deleted deleted_on "$TODAY"
  save_state
  notify info "Cloud SQL DELETED — migration complete" "Instance $INSTANCE deleted; $SERVICE detached from Cloud SQL and healthy; DB_PASS secret removed. Archive: $EXPORT_URI. This job now runs as a daily health check only."
  exit 0
fi

log "nothing to do today (phase=$PHASE)"
