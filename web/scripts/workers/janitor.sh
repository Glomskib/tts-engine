#!/usr/bin/env bash
# janitor.sh — Worker-2 "Queue Janitor"
# Calls stuck-check cron endpoint every 120s (local + prod).
# Auth: requireOwner needs Supabase session (not scriptable),
#       so we use the cron route with CRON_SECRET instead.
#
# Usage: ./scripts/workers/with-lock.sh janitor ./scripts/workers/janitor.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="$WEB_ROOT/logs/workers/janitor.log"
HEARTBEAT="$SCRIPT_DIR/heartbeat.sh"

# ── Load .env.local ──────────────────────────────────────────────
if [ -f "$WEB_ROOT/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"           # strip inline comments
    line="${line#"${line%%[![:space:]]*}"}"  # trim leading whitespace
    line="${line%"${line##*[![:space:]]}"}"  # trim trailing whitespace
    [ -z "$line" ] && continue
    key="${line%%=*}"
    val="${line#*=}"
    # Strip surrounding quotes
    val="${val#\"}" ; val="${val%\"}"
    val="${val#\'}" ; val="${val%\'}"
    export "$key=$val"
  done < "$WEB_ROOT/.env.local"
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date -u +%FT%TZ) FATAL janitor CRON_SECRET not set" | tee -a "$LOG"
  exit 1
fi

LOCAL="http://localhost:3100/api/cron/stuck-check"
PROD="https://flashflowai.com/api/cron/stuck-check"

call_stuck_check() {
  local label="$1" url="$2"
  local http_code body

  local tmp
  tmp=$(mktemp)
  http_code=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "$url" 2>/dev/null) || http_code="000"
  body=$(cat "$tmp" 2>/dev/null)
  rm -f "$tmp"

  local stuck="?"
  if [ "$http_code" -ge 200 ] 2>/dev/null && [ "$http_code" -lt 300 ] 2>/dev/null; then
    stuck=$(echo "$body" | grep -o '"stuck_count":[0-9]*' | head -1 | cut -d: -f2)
    stuck="${stuck:-0}"
  fi

  echo "${label}=${http_code} stuck=${stuck}"
}

# ── Main loop ────────────────────────────────────────────────────
echo "$(date -u +%FT%TZ) START janitor pid=$$" | tee -a "$LOG"

while true; do
  ts=$(date -u +%FT%TZ)

  local_result=$(call_stuck_check "local" "$LOCAL")
  prod_result=$(call_stuck_check "prod" "$PROD")

  detail="${local_result} | ${prod_result}"

  # Log full detail
  echo "${ts} CYCLE janitor ${detail}" >> "$LOG"

  # STATUS heartbeat to stdout
  "$HEARTBEAT" janitor "$detail"

  sleep 120
done
