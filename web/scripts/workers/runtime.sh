#!/usr/bin/env bash
# runtime.sh — Worker-5 "Local Runtime Keeper"
# Monitors Next.js dev server on port 3100. Starts it if down,
# restarts once on death, flags FLAPPING if it dies twice in 10 min.
#
# Usage: ./scripts/workers/with-lock.sh runtime ./scripts/workers/runtime.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="$WEB_ROOT/logs/workers/runtime.log"
HEARTBEAT="$SCRIPT_DIR/heartbeat.sh"

PORT=3100
HEALTH_URL="http://localhost:${PORT}"
INTERVAL=60
FLAP_WINDOW=600  # 10 minutes in seconds

# ── Load .env.local ──────────────────────────────────────────────
if [ -f "$WEB_ROOT/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    key="${line%%=*}"
    val="${line#*=}"
    val="${val#\"}" ; val="${val%\"}"
    val="${val#\'}" ; val="${val%\'}"
    export "$key=$val"
  done < "$WEB_ROOT/.env.local"
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date -u +%FT%TZ) FATAL runtime CRON_SECRET not set" | tee -a "$LOG"
  exit 1
fi

# ── State tracking ───────────────────────────────────────────────
RESTART_COUNT=0
LAST_DEATH_TS=0
SERVER_PID=""

# ── Helpers ──────────────────────────────────────────────────────
log() {
  echo "$(date -u +%FT%TZ) $*" >> "$LOG"
}

check_server() {
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null) || http_code="000"
  # Next.js dev returns 200 or 307 — both are fine
  if [ "$http_code" -ge 200 ] 2>/dev/null && [ "$http_code" -lt 400 ] 2>/dev/null; then
    echo "up"
  else
    echo "down"
  fi
}

start_server() {
  log "START launching Next.js dev on port ${PORT}"
  cd "$WEB_ROOT"
  # Start in background, redirect output to log
  npx next dev --port "$PORT" >> "$LOG" 2>&1 &
  SERVER_PID=$!
  log "START server pid=${SERVER_PID}"

  # Wait up to 30s for server to become healthy
  local waited=0
  while [ $waited -lt 30 ]; do
    sleep 2
    waited=$((waited + 2))
    if [ "$(check_server)" = "up" ]; then
      log "START server healthy after ${waited}s"
      return 0
    fi
  done
  log "WARN server not healthy after 30s, continuing anyway"
  return 0
}

record_death() {
  local now
  now=$(date +%s)
  local elapsed=$((now - LAST_DEATH_TS))

  RESTART_COUNT=$((RESTART_COUNT + 1))
  LAST_DEATH_TS=$now

  if [ $RESTART_COUNT -ge 2 ] && [ $elapsed -lt $FLAP_WINDOW ]; then
    log "FLAPPING server died ${RESTART_COUNT} times within ${elapsed}s — stopping"
    "$HEARTBEAT" runtime "FLAPPING port=${PORT} deaths=${RESTART_COUNT}"
    echo "FLAPPING" | tee -a "$LOG"
    exit 1
  fi
}

# ── Main ─────────────────────────────────────────────────────────
log "START runtime pid=$$ port=${PORT}"
echo "$(date -u +%FT%TZ) START runtime pid=$$ port=${PORT}"

# Initial check — don't steal an existing server
INITIAL_STATUS="$(check_server)"
if [ "$INITIAL_STATUS" = "up" ]; then
  log "INFO server already running on port ${PORT} — monitoring only"
else
  log "INFO server not running on port ${PORT} — starting"
  start_server
fi

# ── Monitor loop ─────────────────────────────────────────────────
while true; do
  sleep "$INTERVAL"

  STATUS="$(check_server)"

  if [ "$STATUS" = "up" ]; then
    # All good — heartbeat
    "$HEARTBEAT" runtime "devserver=up port=${PORT}"
    log "STATUS devserver=up port=${PORT}"
  else
    # Server is down
    log "WARN devserver=down port=${PORT}"

    # If we started it, check if our child is still alive
    if [ -n "$SERVER_PID" ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
      log "WARN server pid=${SERVER_PID} exited"
      SERVER_PID=""
    fi

    record_death

    log "INFO attempting restart (attempt ${RESTART_COUNT})"
    "$HEARTBEAT" runtime "devserver=down port=${PORT} restarting=true"
    start_server
  fi
done
