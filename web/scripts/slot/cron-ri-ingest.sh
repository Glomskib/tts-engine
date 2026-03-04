#!/usr/bin/env bash
set -euo pipefail
#
# Slot-Aware RI Ingestion Cron Wrapper
#
# Called by launchd for slot-specific ingestion.
# Loads .env.local, resolves slot config, runs ingestion scoped to client_id.
#
# Usage:
#   scripts/slot/cron-ri-ingest.sh --slot wife
#   FF_SLOT=wife scripts/slot/cron-ri-ingest.sh
#

TAG="[ri:cron:slot]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# ── Resolve slot ──────────────────────────────────────────────────────────
SLOT_NAME="${FF_SLOT:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slot) SLOT_NAME="$2"; shift 2 ;;
    --slot=*) SLOT_NAME="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

if [ -z "$SLOT_NAME" ]; then
  echo "$TAG FATAL: No slot specified. Use --slot <name> or set FF_SLOT."
  exit 1
fi

# ── Load env ──────────────────────────────────────────────────────────────
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  source "$WEB_DIR/.env.local"
  set +a
fi

export FF_SLOT="$SLOT_NAME"
export FF_RUN_SOURCE="launchd"

LOG_DIR="$WEB_DIR/data/ri-logs"
mkdir -p "$LOG_DIR"

cd "$WEB_DIR"

echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting slot=$SLOT_NAME ingestion"

if npm run ri:ingest:slot -- --slot "$SLOT_NAME" 2>&1; then
  echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) Ingestion completed (slot=$SLOT_NAME)"
  exit 0
else
  EXIT_CODE=$?
  echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) Ingestion failed (slot=$SLOT_NAME, exit=$EXIT_CODE)"
  exit "$EXIT_CODE"
fi
