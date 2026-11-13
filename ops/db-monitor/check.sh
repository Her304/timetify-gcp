#!/usr/bin/env bash
# Read-only daily status report for the Neon cutover and Cloud SQL decommission.
# Run by the Claude scheduled task "timetify DB monitor" (see MONITOR.md) inside
# a Claude cloud environment that provides:
#   - gcloud (environment setup script, see README.md)
#   - GCP_MONITOR_KEY_B64: base64 of the db-monitor-viewer service-account key
#     (viewer-only roles — it cannot change anything)
#   - a network secret for console.neon.tech (project-scoped Neon API key,
#     injected by Anthropic's proxy; this script never sees it)
#
# Prints one line per check: OK / WARN / FAIL, then an OVERALL line.
# Always exits 0 so the agent reads the whole report.
set -uo pipefail

PROJECT=timetify-prod
REGION=us-central1
INSTANCE=timetify-gcp-v2
SERVICE=timetify-web
JOB=cloudsql-decommission
STATE_URI=gs://timetify-prod-ops/decommission/state.json
SITE=https://timetify.net
API=https://timetify-web-931972332433.us-central1.run.app
NEON=https://console.neon.tech/api/v2
NEON_PROJECT=silent-lake-62023841
NEON_CU=0.25                 # compute pinned at 0.25 CU (min = max)
NEON_CU_HOURS_LIMIT=100      # Free plan, per project per month
NEON_STORAGE_LIMIT=$((1024*1024*1024))
NEON_TRANSFER_LIMIT=$((5*1024*1024*1024))
STOP_AFTER=2026-11-15
DELETE_AFTER=2026-11-20
TODAY=$(TZ=America/Toronto date +%F)

WORST=0   # 0 ok, 1 warn, 2 fail
ok()   { echo "OK    $*"; }
warn() { echo "WARN  $*"; [ $WORST -lt 1 ] && WORST=1; }
fail() { echo "FAIL  $*"; WORST=2; }
code() { curl -s -o /dev/null -m 30 -w '%{http_code}' "$@" 2>/dev/null || true; }
py()   { python3 -c "$@"; }
# Neon auth normally comes from the proxy's network secret. For local runs use
# NEON_API_KEY=<key>, or NEON_VIA_NEONCTL=1 to reuse a logged-in neonctl.
neon_get() {
  if [ "${NEON_VIA_NEONCTL:-0}" = 1 ]; then neonctl api "${1#"$NEON"}" 2>/dev/null || true
  elif [ -n "${NEON_API_KEY:-}" ]; then curl -s -m 30 -H "Authorization: Bearer $NEON_API_KEY" "$1" 2>/dev/null || true
  else curl -s -m 30 "$1" 2>/dev/null || true; fi
}

echo "timetify DB monitor — $TODAY (America/Toronto)"
echo

# --- 1. public endpoints (no credentials) -----------------------------------
echo "## Site"
c=$(code "$SITE/");               [ "$c" = 200 ] && ok "timetify.net/ -> 200" || fail "timetify.net/ -> ${c:-000}"
c=$(code "$API/sitemap.xml");     [ "$c" = 200 ] && ok "backend /sitemap.xml (DB read) -> 200" || fail "backend /sitemap.xml -> ${c:-000}"
c=$(code "$API/api/friends/");    [ "$c" = 401 ] && ok "backend /api/friends/ unauthenticated -> 401" || fail "backend /api/friends/ -> ${c:-000} (want 401)"

# --- 2. GCP (viewer-only key) -----------------------------------------------
echo; echo "## Google Cloud"
GCP=0
# MONITOR_USE_AMBIENT_GCLOUD=1: local runs reuse the current gcloud login.
[ "${MONITOR_USE_AMBIENT_GCLOUD:-0}" = 1 ] && GCP=1
if [ $GCP = 0 ] && [ -n "${GCP_MONITOR_KEY_B64:-}" ] && command -v gcloud >/dev/null; then
  KEYF=$(mktemp); printf %s "$GCP_MONITOR_KEY_B64" | base64 -d > "$KEYF"
  gcloud auth activate-service-account --key-file "$KEYF" -q >/dev/null 2>&1 && GCP=1
  rm -f "$KEYF"
fi
if [ $GCP = 0 ]; then
  warn "GCP checks skipped — gcloud missing or GCP_MONITOR_KEY_B64 unset/invalid"
else
  ENV_NAMES=$(gcloud run services describe $SERVICE --project $PROJECT --region $REGION \
    --format='value(spec.template.spec.containers[0].env[].name)' 2>/dev/null | tr ';' '\n')
  REV=$(gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format='value(status.latestReadyRevisionName)' 2>/dev/null)
  grep -qx DATABASE_URL <<<"$ENV_NAMES" && ok "$SERVICE ($REV) is on DATABASE_URL (Neon)" \
    || fail "$SERVICE ($REV) has NO DATABASE_URL — production may be back on Cloud SQL"

  N5XX=$(gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND httpRequest.status>=500" \
    --project $PROJECT --freshness=1d --limit 500 --format='value(timestamp)' 2>/dev/null | wc -l | tr -d ' ')
  if   [ "$N5XX" -eq 0 ];  then ok   "backend 5xx in last 24h: 0"
  elif [ "$N5XX" -le 20 ]; then warn "backend 5xx in last 24h: $N5XX"
  else                          fail "backend 5xx in last 24h: $N5XX"; fi

  MOD=$(gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND httpRequest.requestUrl:\"run-moderation\"" \
    --project $PROJECT --freshness=1d --limit 200 --format='value(httpRequest.status)' 2>/dev/null | sort | uniq -c | tr -s ' ' | paste -sd, -)
  if [ -z "$MOD" ]; then warn "moderation cron: no calls in 24h (expected ~48)"
  elif grep -qvE '^ ?[0-9]+ 200$' <<<"$(tr ',' '\n' <<<"$MOD")"; then warn "moderation cron statuses (count status): $MOD"
  else ok "moderation cron: all 200 ($MOD)"; fi

  SQL=$(gcloud sql instances describe $INSTANCE --project $PROJECT --format='value(state,settings.activationPolicy)' 2>/dev/null | tr '\t' ' ')
  [ -z "$SQL" ] && SQL="DELETED"
  ok "Cloud SQL $INSTANCE: $SQL"

  STATE=$(gcloud storage cat "$STATE_URI" 2>/dev/null || true)
  if [ -z "$STATE" ]; then
    warn "decommission job: no state.json yet (setup.sh not run, or job hasn't run)"
    PHASE=none
  else
    PHASE=$(py 'import json,sys;print(json.loads(sys.argv[1]).get("phase","monitor"))' "$STATE")
    ok "decommission job state: $(py 'import json,sys;s=json.loads(sys.argv[1]);print(", ".join(f"{k}={s[k]}" for k in ("phase","last_check","last_result","healthy_streak","healthy_since_stop","export_uri","stopped_on","deleted_on") if k in s))' "$STATE")"
    LASTCHK=$(py 'import json,sys;print(json.loads(sys.argv[1]).get("last_check",""))' "$STATE")
    [ "$LASTCHK" = "$TODAY" ] || warn "decommission job hasn't checked in today (last_check=$LASTCHK) — runs 09:00 Toronto"
  fi
  read -r EXNAME EXDONE EXOK EXFAIL <<<"$(gcloud run jobs executions list --job $JOB --project $PROJECT --region $REGION --limit 1 \
    --format='value(metadata.name,status.completionTime,status.succeededCount,status.failedCount)' 2>/dev/null | tr '\t' ' ')"
  if [ -z "${EXNAME:-}" ]; then warn "no executions of job $JOB yet"
  elif [ "${EXFAIL:-0}" != "" ] && [ "${EXFAIL:-0}" -gt 0 ] 2>/dev/null; then fail "last job execution $EXNAME FAILED (finished ${EXDONE:-?}) — read its logs"
  else ok "last job execution $EXNAME finished ${EXDONE:-running}"; fi

  # Schedule expectations vs. reality
  if [[ "$TODAY" > "$STOP_AFTER" ]] && [ "$PHASE" = monitor ] && [[ "$SQL" == RUNNABLE* ]]; then
    warn "past $STOP_AFTER but Cloud SQL still running (needs 2 healthy days; check streak above)"
  fi
  if [[ "$TODAY" > "$DELETE_AFTER" ]] && [ "$PHASE" = stopped ]; then
    warn "past $DELETE_AFTER but instance not deleted yet (needs 5 healthy days since stop)"
  fi
  if [ "$PHASE" = stopped ] && [[ "$SQL" == RUNNABLE*ALWAYS* ]]; then
    warn "state says stopped but Cloud SQL is RUNNING again — someone restarted it?"
  fi
fi

# --- 3. Neon (network secret injected by the proxy) --------------------------
echo; echo "## Neon"
NP=$(neon_get "$NEON/projects/$NEON_PROJECT")
NE=$(neon_get "$NEON/projects/$NEON_PROJECT/endpoints")
NB=$(neon_get "$NEON/projects/$NEON_PROJECT/branches")
python3 - "$NP" "$NE" "$NB" "$NEON_CU" "$NEON_CU_HOURS_LIMIT" "$NEON_STORAGE_LIMIT" "$NEON_TRANSFER_LIMIT" <<'EOF'
import json, sys, datetime as dt
np_, ne, nb, cu, cu_limit, s_limit, t_limit = sys.argv[1:8]
cu, cu_limit, s_limit, t_limit = float(cu), float(cu_limit), int(s_limit), int(t_limit)
worst = 0
def out(level, msg):
    global worst
    worst = max(worst, level)
    print(("OK   ", "WARN ", "FAIL ")[level] + " " + msg)
try:
    p = json.loads(np_)["project"]; eps = json.loads(ne)["endpoints"]; brs = json.loads(nb)["branches"]
except Exception:
    out(1, "Neon API unreachable or unauthorised — check the console.neon.tech network secret")
    sys.exit(worst)
start = dt.datetime.fromisoformat(p["consumption_period_start"].replace("Z", "+00:00"))
end = dt.datetime.fromisoformat(p["consumption_period_end"].replace("Z", "+00:00"))
now = dt.datetime.now(dt.timezone.utc)
used = p.get("active_time_seconds", 0) * cu / 3600
frac = max((now - start) / (end - start), 1e-6)
proj = used / frac
lvl = 0 if proj < 0.7 * cu_limit else 1 if proj < cu_limit else 2
out(lvl, f"CU-hours this period: {used:.1f} used, ~{proj:.0f} projected by {end.date()} (limit {cu_limit:.0f}; over = DB suspended until next period)")
xfer = p.get("data_transfer_bytes", 0)
out(0 if xfer < 0.5 * t_limit else 1, f"data transfer: {xfer/1e6:.0f} MB of {t_limit/2**30:.0f} GB")
size = max((b.get("logical_size", 0) for b in brs), default=0)
out(0 if size < 0.7 * s_limit else 1, f"storage: {size/2**20:.0f} MB of {s_limit/2**20:.0f} MB (over = writes blocked)")
for e in eps:
    out(0, f"compute {e['id']}: {e.get('current_state')}, {e.get('autoscaling_limit_min_cu')}-{e.get('autoscaling_limit_max_cu')} CU, last active {e.get('last_active')}")
    if (e.get("autoscaling_limit_max_cu") or 0) > cu:
        out(1, f"autoscaling max is {e['autoscaling_limit_max_cu']} CU (> {cu}) — CU-hours burn faster")
sys.exit(worst)
EOF
r=$?; [ $r -gt $WORST ] && WORST=$r

echo
case $WORST in
  0) echo "OVERALL: OK";;
  1) echo "OVERALL: WARN";;
  *) echo "OVERALL: FAIL";;
esac
exit 0
