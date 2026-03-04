#!/usr/bin/env bash
set -euo pipefail
#
# Revenue Intelligence — Scheduled Ingestion Wrapper
#
# Called by launchd every 10 minutes (com.flashflow.ri-ingest).
# Loads .env.local, runs the ingestion pipeline, exits non-zero on failure.
# The Node script handles its own run-lock (.ri-ingestion.lock) to prevent
# overlapping runs — this wrapper does NOT need to duplicate that.
#
# Manual run:  ./scripts/revenue-intelligence/cron-ri-ingest.sh
#

TAG="[ri:cron-wrapper]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$WEB_DIR/data/ri-logs"

mkdir -p "$LOG_DIR"

# ── Load env vars from .env.local ────────────────────────────────────────────
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$WEB_DIR/.env.local"
  set +a
else
  echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) FATAL: .env.local not found at $WEB_DIR/.env.local"
  exit 1
fi

# ── Stamp run source for observability ────────────────────────────────────────
export FF_RUN_SOURCE="launchd"

# ── Run ingestion ────────────────────────────────────────────────────────────
cd "$WEB_DIR"

echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting ingestion run (source=$FF_RUN_SOURCE)"

if npm run ri:ingest 2>&1; then
  echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) Ingestion completed successfully"
  exit 0
else
  EXIT_CODE=$?
  echo "$TAG $(date -u +%Y-%m-%dT%H:%M:%SZ) Ingestion failed with exit code $EXIT_CODE"
  exit "$EXIT_CODE"
fi
