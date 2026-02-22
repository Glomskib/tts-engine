#!/usr/bin/env bash
set -uo pipefail
#
# Scheduled TikTok Session Healthcheck — launchd wrapper
#
# Runs the healthcheck and fires a ONE-TIME alert on exit 42 (session invalid),
# respecting the cooldown lockfile to avoid duplicate noise.
#
# Alert pathway:
#   1. Telegram notification (primary — always available)
#   2. Issue intake API (best-effort — only if Next.js server is running)
#
# Usage:
#   This script is called by launchd every 30 minutes.
#   Manual: ./scripts/tiktok-studio/scheduled-healthcheck.sh
#   Simulate failure: FORCE_INVALID=1 ./scripts/tiktok-studio/scheduled-healthcheck.sh
#

TAG="[scheduled-healthcheck]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$WEB_DIR/data/sessions/logs"
COOLDOWN_LOCK="$WEB_DIR/data/sessions/.session-invalid.lock"
COOLDOWN_HOURS="${SESSION_INVALID_COOLDOWN_HOURS:-6}"

# Load env vars (Telegram tokens, etc.)
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$WEB_DIR/.env.local"
  set +a
fi

mkdir -p "$LOG_DIR"

echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') $TAG Starting scheduled healthcheck..."

# ── Run healthcheck ──────────────────────────────────────────────────────────

cd "$WEB_DIR"

if [ "${FORCE_INVALID:-}" = "1" ]; then
  echo "$TAG FORCE_INVALID=1 — simulating exit 42"
  rc=42
else
  set +e
  npm run tiktok:healthcheck 2>&1
  rc=$?
  set -e
fi

echo ""
echo "$TAG Healthcheck exited with code: $rc"

# ── Handle exit code ─────────────────────────────────────────────────────────

if [ $rc -eq 0 ]; then
  echo "$TAG Session healthy. No action needed."
  exit 0
fi

if [ $rc -ne 42 ]; then
  echo "$TAG Unexpected exit code $rc (not 0, not 42). Treating as error."
  # Don't alert on transient errors — only session-invalid (42) fires alerts
  exit $rc
fi

# ── Exit 42: check cooldown before alerting ──────────────────────────────────

echo "$TAG Session invalid (exit 42). Checking cooldown..."

should_alert=1

if [ -f "$COOLDOWN_LOCK" ]; then
  lock_age_s=$(( $(date +%s) - $(stat -f %m "$COOLDOWN_LOCK") ))
  cooldown_s=$(( COOLDOWN_HOURS * 3600 ))
  lock_age_h=$(echo "scale=1; $lock_age_s / 3600" | bc)

  if [ "$lock_age_s" -lt "$cooldown_s" ]; then
    echo "$TAG Cooldown active (${lock_age_h}h ago, window=${COOLDOWN_HOURS}h). Suppressing alert."
    should_alert=0
  else
    echo "$TAG Cooldown expired (${lock_age_h}h old). Will re-alert."
  fi
fi

if [ $should_alert -eq 0 ]; then
  echo "$TAG Done (alert suppressed by cooldown)."
  exit 42
fi

# ── Set cooldown lockfile ────────────────────────────────────────────────────

mkdir -p "$(dirname "$COOLDOWN_LOCK")"
cooldown_set_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
echo "$cooldown_set_at" > "$COOLDOWN_LOCK"
echo "$TAG Cooldown lockfile written: $COOLDOWN_LOCK"

cooldown_clears_at=$(date -u -v+"${COOLDOWN_HOURS}H" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || echo "~${COOLDOWN_HOURS}h from now")

# ── Gather enriched context ──────────────────────────────────────────────────

node_name="$(hostname)"
platform="tiktok_studio"
detected_at="$(date -u '+%Y-%m-%d %H:%M UTC')"

# Extract reason from latest regression report where session_valid=false
session_reason="unknown"
for report_file in $(ls -t "$WEB_DIR/var/run-reports"/*/report.json 2>/dev/null | head -10); do
  is_valid=$(jq -r '.session_valid' "$report_file" 2>/dev/null || echo "true")
  if [ "$is_valid" = "false" ]; then
    session_reason=$(jq -r '.session_reason // "unknown"' "$report_file" 2>/dev/null || echo "unknown")
    echo "$TAG Extracted reason from report: $report_file"
    echo "$TAG   → $session_reason"
    break
  fi
done

# Classify reason into a short tag
case "$session_reason" in
  *login*|*Login*)       reason_tag="redirected_to_login" ;;
  *captcha*|*Captcha*)   reason_tag="captcha" ;;
  *2FA*|*two-factor*)    reason_tag="2fa_challenge" ;;
  *expired*|*Expired*)   reason_tag="session_expired" ;;
  *profile*|*Profile*)   reason_tag="no_profile" ;;
  *error*|*Error*)       reason_tag="browser_error" ;;
  *)                     reason_tag="logged_out" ;;
esac

# Try session-status API for TTL context (best-effort)
ttl_line=""
BASE_URL="${FLASHFLOW_BASE_URL:-http://localhost:3000}"
session_api_json=$(curl -s --connect-timeout 3 --max-time 5 \
  "${BASE_URL}/api/session-status?platform=tiktok" 2>/dev/null || echo "")

if [ -n "$session_api_json" ] && echo "$session_api_json" | jq -e '.ok' >/dev/null 2>&1; then
  api_ttl=$(echo "$session_api_json" | jq -r '.statuses[0].ttl_remaining_hours // empty' 2>/dev/null)
  api_expires=$(echo "$session_api_json" | jq -r '.statuses[0].expires_at // empty' 2>/dev/null)
  api_last=$(echo "$session_api_json" | jq -r '.statuses[0].last_validated_at // empty' 2>/dev/null)
  if [ -n "$api_ttl" ]; then
    ttl_line="TTL remaining: ${api_ttl}h (expires ${api_expires:-unknown})"
    echo "$TAG Session API: last_validated=${api_last}, ttl=${api_ttl}h"
  fi
fi

# ── Alert: Telegram ──────────────────────────────────────────────────────────

# Build enriched message (8-12 lines)
alert_message="<b>TikTok Session Invalid</b>

<b>Node:</b> ${node_name}
<b>Platform:</b> ${platform}
<b>Reason:</b> ${reason_tag}
<b>Detail:</b> ${session_reason}
<b>Detected:</b> ${detected_at}"

if [ -n "$ttl_line" ]; then
  alert_message="${alert_message}
<b>${ttl_line}</b>"
fi

alert_message="${alert_message}

<b>Fix:</b>
<code>cd ~/tts-engine/web && pnpm run tiktok:bootstrap</code>
<code>rm -f ~/tts-engine/web/data/sessions/.session-invalid.lock</code>

<i>Cooldown: suppressed until ${cooldown_clears_at}</i>"

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "$TAG Sending Telegram alert..."
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg chat_id "$TELEGRAM_CHAT_ID" \
      --arg text "$alert_message" \
      '{chat_id: $chat_id, text: $text, parse_mode: "HTML"}')" \
  )
  if [ "$http_code" = "200" ]; then
    echo "$TAG Telegram alert sent (HTTP $http_code)"
  else
    echo "$TAG Telegram alert failed (HTTP $http_code)"
  fi
else
  echo "$TAG WARN: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram alert"
fi

# ── Alert: Issue intake (best-effort) ────────────────────────────────────────

INTAKE_URL="${BASE_URL}/api/flashflow/issues/intake"

echo "$TAG Posting to issue intake (best-effort): $INTAKE_URL"
intake_response=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 5 --max-time 10 \
  -X POST "$INTAKE_URL" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg source "tiktok-healthcheck" \
    --arg reporter "launchd/${node_name}" \
    --arg message "TikTok Studio session invalid (exit 42). Reason: ${reason_tag}. Detail: ${session_reason}. Node: ${node_name}." \
    --arg reason "$reason_tag" \
    --arg detail "$session_reason" \
    '{source: $source, reporter: $reporter, message_text: $message, context_json: {exit_code: 42, node_name: $reporter, reason: $reason, detail: $detail}}')" \
  2>/dev/null || echo "000")

if [ "$intake_response" = "200" ] || [ "$intake_response" = "201" ]; then
  echo "$TAG Issue intake: OK (HTTP $intake_response)"
else
  echo "$TAG Issue intake: skipped or failed (HTTP $intake_response) — non-critical"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "$TAG Alert sent. Session needs manual bootstrap."
echo "$TAG Next healthcheck in ~30 minutes (will be suppressed by cooldown)."
exit 42
