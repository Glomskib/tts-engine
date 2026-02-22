#!/usr/bin/env bash
set -euo pipefail
#
# TikTok Session Health Check
#
# Single command to verify session readiness for unattended runs.
# Returns exit 0 (healthy) or 42 (needs manual bootstrap).
#
# Usage:
#   ./scripts/tiktok-studio/session-healthcheck.sh
#   npm run tiktok:healthcheck
#
# Checks performed:
#   1. Profile directory exists
#   2. Cooldown lockfile status
#   3. StorageState backup age
#   4. Regression harness (quick mode, no upload) via HEADLESS=1
#
# Exit codes:
#   0  = session healthy, ready for overnight runs
#   42 = session invalid or blocked — needs manual bootstrap

TAG="[healthcheck]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_DIR="$WEB_DIR/data/sessions/tiktok-studio-profile"
STORAGE_STATE="$WEB_DIR/data/sessions/tiktok-studio.storageState.json"
META_FILE="$WEB_DIR/data/sessions/tiktok-studio.meta.json"
COOLDOWN_LOCK="$WEB_DIR/data/sessions/.session-invalid.lock"
COOLDOWN_HOURS="${SESSION_INVALID_COOLDOWN_HOURS:-6}"

failed=0

echo "=== TikTok Session Health Check ==="
echo ""

# ── 1. Profile directory ──────────────────────────────────────────────────────
echo "$TAG Checking profile directory..."
if [ -d "$PROFILE_DIR" ]; then
  profile_age=$(( ($(date +%s) - $(stat -f %m "$PROFILE_DIR")) / 86400 ))
  echo "  OK: $PROFILE_DIR (${profile_age}d old)"
else
  echo "  FAIL: Profile directory does not exist: $PROFILE_DIR"
  echo ""
  echo "  Remediation: run 'cd $WEB_DIR && pnpm run tiktok:bootstrap'"
  exit 42
fi

# ── 2. Cooldown lockfile ──────────────────────────────────────────────────────
echo "$TAG Checking cooldown lockfile..."
if [ -f "$COOLDOWN_LOCK" ]; then
  lock_age_s=$(( $(date +%s) - $(stat -f %m "$COOLDOWN_LOCK") ))
  lock_age_h=$(echo "scale=1; $lock_age_s / 3600" | bc)
  cooldown_s=$(( COOLDOWN_HOURS * 3600 ))

  if [ "$lock_age_s" -lt "$cooldown_s" ]; then
    echo "  BLOCKED: Cooldown lockfile active (${lock_age_h}h ago, window=${COOLDOWN_HOURS}h)"
    echo "  Session was already reported invalid. Still within suppression window."
    echo ""
    echo "  Remediation:"
    echo "    1. Run: cd $WEB_DIR && pnpm run tiktok:bootstrap"
    echo "    2. Clear lockfile: rm $COOLDOWN_LOCK"
    exit 42
  else
    echo "  WARN: Stale cooldown lockfile (${lock_age_h}h old, past ${COOLDOWN_HOURS}h window)"
    echo "  Will be auto-cleared on next upload run."
  fi
else
  echo "  OK: No cooldown lockfile"
fi

# ── 3. StorageState backup ────────────────────────────────────────────────────
echo "$TAG Checking storageState backup..."
if [ -f "$STORAGE_STATE" ]; then
  ss_age=$(( ($(date +%s) - $(stat -f %m "$STORAGE_STATE")) / 86400 ))
  echo "  OK: $STORAGE_STATE (${ss_age}d old)"
  if [ "$ss_age" -gt 14 ]; then
    echo "  WARN: StorageState backup is ${ss_age} days old — consider re-bootstrapping"
  fi
else
  echo "  WARN: No storageState backup at $STORAGE_STATE"
fi

# ── 4. Bootstrap meta ─────────────────────────────────────────────────────────
echo "$TAG Checking bootstrap meta..."
if [ -f "$META_FILE" ]; then
  saved_at=$(grep -o '"saved_at"[[:space:]]*:[[:space:]]*"[^"]*"' "$META_FILE" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || echo "unknown")
  verified=$(grep -o '"verified"[[:space:]]*:[[:space:]]*[a-z]*' "$META_FILE" | head -1 | sed 's/.*:[[:space:]]*//' || echo "unknown")
  echo "  Last bootstrap: $saved_at (verified=$verified)"
else
  echo "  WARN: No meta file — bootstrap may not have been run"
fi

# ── 5. Regression harness (headless, quick) ───────────────────────────────────
echo ""
echo "$TAG Running regression harness (HEADLESS=1, no upload)..."
echo ""

cd "$WEB_DIR"
set +e
HEADLESS=1 TIKTOK_HEADLESS=true pnpm run tiktok:regression 2>&1
rc=$?
set -e

echo ""
if [ $rc -eq 0 ]; then
  echo "$TAG Regression: PASSED"
elif [ $rc -eq 42 ]; then
  echo "$TAG Regression: SESSION INVALID (exit 42)"
  failed=1
else
  echo "$TAG Regression: FAILED (exit $rc)"
  failed=1
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
if [ $failed -eq 0 ]; then
  echo "  STATUS: HEALTHY — ready for overnight runs"
  echo ""
  exit 0
else
  echo "  STATUS: UNHEALTHY — session needs manual intervention"
  echo ""
  echo "  Remediation:"
  echo "    1. cd $WEB_DIR && pnpm run tiktok:bootstrap"
  echo "    2. Verify: pnpm run tiktok:check-session"
  echo "    3. Clear lockfile: rm -f $COOLDOWN_LOCK"
  echo ""
  exit 42
fi
