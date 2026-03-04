#!/usr/bin/env bash
set -uo pipefail
#
# TikTok Nightly Draft — launchd wrapper
#
# Thin shell script for launchd that:
#   1. Sets PATH, HOME, loads .env.local
#   2. Preflight: checks profile dir + cooldown lockfile
#   3. Runs `npm run tiktok:nightly-draft`
#   4. On exit 42 → sends Telegram alert (respecting cooldown)
#
# Exit codes (passed through from nightly-draft.ts):
#   0  = all videos drafted (or queue empty)
#   1  = some videos failed
#   42 = session invalid — needs bootstrap
#
# Usage:
#   ./scripts/tiktok-studio/nightly-draft.sh
#   Manual test: MAX_NIGHTLY_UPLOADS=1 ./scripts/tiktok-studio/nightly-draft.sh
#

TAG="[nightly-draft-wrapper]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$WEB_DIR/data/sessions/logs"

# Load env vars (.env.local has SUPABASE keys, TELEGRAM tokens, etc.)
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$WEB_DIR/.env.local"
  set +a
fi

mkdir -p "$LOG_DIR"

# Stamp run source for observability
export FF_RUN_SOURCE="launchd"

echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') $TAG Starting nightly draft job... (source=$FF_RUN_SOURCE)"
echo "$TAG Working directory: $WEB_DIR"
echo "$TAG FF_NODE_ID:       ${FF_NODE_ID:-<not set>}"
echo "$TAG hostname:         $(hostname)"
echo "$TAG effective node_id: ${FF_NODE_ID:-$(hostname)}"

# ── 1. Preflight: profile dir + cooldown ─────────────────────────────────────

PROFILE_DIR="$WEB_DIR/data/sessions/tiktok-studio-profile"
COOLDOWN_LOCK="$WEB_DIR/data/sessions/.session-invalid.lock"
COOLDOWN_HOURS="${SESSION_INVALID_COOLDOWN_HOURS:-6}"

echo "$TAG Preflight: checking profile + cooldown..."

if [ ! -d "$PROFILE_DIR" ]; then
  echo "$TAG ABORT: Profile directory missing: $PROFILE_DIR"
  echo "$TAG Run: cd $WEB_DIR && npm run tiktok:bootstrap"
  exit 42
fi

if [ -f "$COOLDOWN_LOCK" ]; then
  lock_age_s=$(( $(date +%s) - $(stat -f %m "$COOLDOWN_LOCK") ))
  cooldown_s=$(( COOLDOWN_HOURS * 3600 ))

  if [ "$lock_age_s" -lt "$cooldown_s" ]; then
    lock_age_h=$(echo "scale=1; $lock_age_s / 3600" | bc)
    echo "$TAG ABORT: Session-invalid cooldown active (${lock_age_h}h ago, window=${COOLDOWN_HOURS}h)"
    echo "$TAG Run: cd $WEB_DIR && npm run tiktok:bootstrap"
    exit 42
  fi
fi

echo "$TAG Preflight: OK"

# ── 2. Run nightly draft ─────────────────────────────────────────────────────

cd "$WEB_DIR"

echo "$TAG Running: npm run tiktok:nightly-draft"
echo ""

set +e
npm run tiktok:nightly-draft 2>&1
rc=$?
set -e

echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') $TAG Nightly draft exited with code: $rc"

# ── 3. Handle exit code ──────────────────────────────────────────────────────

if [ $rc -eq 0 ]; then
  echo "$TAG All drafts saved (or queue empty)."
  exit 0
fi

if [ $rc -ne 42 ]; then
  echo "$TAG Some uploads failed (exit $rc). Check report JSON in data/sessions/logs/."
  exit $rc
fi

# ── 4. Exit 42: Telegram alert (respecting cooldown) ─────────────────────────

echo "$TAG Session invalid (exit 42). Checking cooldown for alert..."

should_alert=1

if [ -f "$COOLDOWN_LOCK" ]; then
  lock_age_s=$(( $(date +%s) - $(stat -f %m "$COOLDOWN_LOCK") ))
  cooldown_s=$(( COOLDOWN_HOURS * 3600 ))

  if [ "$lock_age_s" -lt "$cooldown_s" ]; then
    echo "$TAG Cooldown active — suppressing alert."
    should_alert=0
  fi
fi

if [ $should_alert -eq 1 ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  node_name="${FF_NODE_ID:-$(hostname)}"
  detected_at="$(date -u '+%Y-%m-%d %H:%M UTC')"

  alert_message="<b>TikTok Nightly Draft — Session Invalid</b>

<b>Node:</b> ${node_name}
<b>Detected:</b> ${detected_at}

<b>Fix:</b>
<code>cd ~/tts-engine/web && npm run tiktok:bootstrap</code>

<i>Nightly drafts paused until session is restored.</i>"

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
  if [ $should_alert -eq 1 ]; then
    echo "$TAG WARN: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert"
  fi
fi

echo "$TAG Session needs manual bootstrap."
exit 42
