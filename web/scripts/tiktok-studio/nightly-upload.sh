#!/usr/bin/env bash
set -uo pipefail
#
# TikTok Nightly Upload — launchd wrapper
#
# Thin shell script for launchd that:
#   1. Sets PATH, HOME, loads .env.local
#   2. Runs session-healthcheck.sh first (exit 42 → abort)
#   3. Runs `pnpm run tiktok:nightly`
#   4. Captures exit code, logs result
#
# Exit codes (passed through from nightly-upload.ts):
#   0  = all videos uploaded successfully (or queue empty)
#   1  = some videos failed
#   42 = session invalid — needs bootstrap
#
# Usage:
#   ./scripts/tiktok-studio/nightly-upload.sh
#   Manual test: NIGHTLY_LIMIT=1 ./scripts/tiktok-studio/nightly-upload.sh
#

TAG="[nightly-wrapper]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$WEB_DIR/data/sessions/logs"

# Load env vars (.env.local has FF_API_TOKEN, TELEGRAM tokens, etc.)
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$WEB_DIR/.env.local"
  set +a
fi

mkdir -p "$LOG_DIR"

echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') $TAG Starting nightly upload..."
echo "$TAG Working directory: $WEB_DIR"

# ── 1. Session healthcheck (quick, no browser) ──────────────────────────────
# Skip the full regression harness — just check profile dir + cooldown lockfile.
# The nightly script does its own preflight + the browser open will catch real issues.

PROFILE_DIR="$WEB_DIR/data/sessions/tiktok-studio-profile"
COOLDOWN_LOCK="$WEB_DIR/data/sessions/.session-invalid.lock"
COOLDOWN_HOURS="${SESSION_INVALID_COOLDOWN_HOURS:-6}"

echo "$TAG Preflight: checking profile + cooldown..."

if [ ! -d "$PROFILE_DIR" ]; then
  echo "$TAG ABORT: Profile directory missing: $PROFILE_DIR"
  echo "$TAG Run: cd $WEB_DIR && pnpm run tiktok:bootstrap"
  exit 42
fi

if [ -f "$COOLDOWN_LOCK" ]; then
  lock_age_s=$(( $(date +%s) - $(stat -f %m "$COOLDOWN_LOCK") ))
  cooldown_s=$(( COOLDOWN_HOURS * 3600 ))

  if [ "$lock_age_s" -lt "$cooldown_s" ]; then
    lock_age_h=$(echo "scale=1; $lock_age_s / 3600" | bc)
    echo "$TAG ABORT: Session-invalid cooldown active (${lock_age_h}h ago, window=${COOLDOWN_HOURS}h)"
    echo "$TAG Run: cd $WEB_DIR && pnpm run tiktok:bootstrap"
    exit 42
  fi
fi

echo "$TAG Preflight: OK"

# ── 2. Run nightly upload ────────────────────────────────────────────────────

cd "$WEB_DIR"

# Build CLI args from env overrides
ARGS=""
if [ -n "${NIGHTLY_LIMIT:-}" ]; then
  ARGS="$ARGS --limit $NIGHTLY_LIMIT"
fi
if [ -n "${NIGHTLY_MODE:-}" ]; then
  ARGS="$ARGS --mode $NIGHTLY_MODE"
fi
if [ "${NIGHTLY_DRY_RUN:-}" = "1" ]; then
  ARGS="$ARGS --dry-run"
fi

echo "$TAG Running: pnpm run tiktok:nightly -- $ARGS"
echo ""

set +e
pnpm run tiktok:nightly -- $ARGS 2>&1
rc=$?
set -e

echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') $TAG Nightly upload exited with code: $rc"

# ── 3. Handle exit code ─────────────────────────────────────────────────────

if [ $rc -eq 0 ]; then
  echo "$TAG All uploads succeeded (or queue empty)."
elif [ $rc -eq 42 ]; then
  echo "$TAG SESSION INVALID — manual bootstrap required."
  echo "$TAG Run: cd $WEB_DIR && pnpm run tiktok:bootstrap"
else
  echo "$TAG Some uploads failed (exit $rc). Check summary JSON in data/tiktok-uploads/."
fi

exit $rc
