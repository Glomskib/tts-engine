#!/usr/bin/env bash
set -euo pipefail
#
# TikTok Session Recovery
#
# Guided recovery for exit-42 session failures. Opens headed bootstrap,
# waits for login, then validates the session end-to-end.
#
# Usage:
#   ./scripts/tiktok-studio/recover-tiktok-session.sh
#   ./scripts/tiktok-studio/recover-tiktok-session.sh --with-regression
#   pnpm run tiktok:recover
#   pnpm run tiktok:recover -- --with-regression
#
# What it does:
#   1. Explains why recovery is needed (exit 42 semantics)
#   2. Runs bootstrap (headed, waits for manual login)
#   3. Clears cooldown lockfile
#   4. Runs healthcheck (and regression if --with-regression)
#   5. On failure: prints next steps (rotate only if profile corrupt)
#
# Exit codes:
#   0  = recovery successful, session healthy
#   1  = recovery failed (see output for next steps)

TAG="[recover]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COOLDOWN_LOCK="$WEB_DIR/data/sessions/.session-invalid.lock"
PROFILE_DIR="$WEB_DIR/data/sessions/tiktok-studio-profile"
WITH_REGRESSION=false

for arg in "$@"; do
  case "$arg" in
    --with-regression) WITH_REGRESSION=true ;;
  esac
done

cd "$WEB_DIR"

# ── 1. Explain ────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  TikTok Session Recovery"
echo "=========================================="
echo ""
echo "$TAG Why you're here:"
echo "  An upload or healthcheck exited with code 42, meaning"
echo "  the TikTok Studio session is invalid. All uploads will"
echo "  fail until you log in manually via the headed browser."
echo ""

# ── 2. Pre-checks ────────────────────────────────────────────────────────────
echo "$TAG Pre-checks..."

# Check for browser lock
if [ -f "$PROFILE_DIR/SingletonLock" ]; then
  echo "  WARN: Browser lock detected — another process may be using the profile."
  echo "  If no upload is running, this is a stale lock (will be auto-cleaned)."
fi

# Show lockfile status
if [ -f "$COOLDOWN_LOCK" ]; then
  lock_age_s=$(( $(date +%s) - $(stat -f %m "$COOLDOWN_LOCK") ))
  lock_age_h=$(echo "scale=1; $lock_age_s / 3600" | bc)
  echo "  Cooldown lockfile present (${lock_age_h}h old) — will be cleared after login."
else
  echo "  No cooldown lockfile."
fi
echo ""

# ── 3. Bootstrap ──────────────────────────────────────────────────────────────
echo "$TAG Starting bootstrap (headed browser)..."
echo "$TAG Log in to TikTok in the browser window that opens."
echo "$TAG The script auto-detects login and saves the session."
echo ""

set +e
pnpm run tiktok:bootstrap
bootstrap_rc=$?
set -e

if [ $bootstrap_rc -ne 0 ]; then
  echo ""
  echo "$TAG Bootstrap failed (exit $bootstrap_rc)."
  echo ""

  # Diagnose
  if [ -f "$PROFILE_DIR/SingletonLock" ]; then
    echo "$TAG DIAGNOSIS: Profile is locked by another process."
    echo ""
    echo "  Next steps:"
    echo "    1. Check for running browsers: ps aux | grep chromium | grep tiktok-studio"
    echo "    2. Kill the process if stuck, then retry recovery"
    echo "    3. If still failing: pnpm run tiktok:rotate && pnpm run tiktok:recover"
  elif [ ! -d "$PROFILE_DIR" ]; then
    echo "$TAG DIAGNOSIS: Profile directory does not exist."
    echo ""
    echo "  Next steps:"
    echo "    1. Retry: pnpm run tiktok:recover"
    echo "    2. Bootstrap will create a fresh profile automatically"
  else
    echo "$TAG DIAGNOSIS: Login was not completed within the timeout."
    echo ""
    echo "  Next steps:"
    echo "    1. Retry: pnpm run tiktok:recover"
    echo "    2. Be ready to log in within 5 minutes of the browser opening"
    echo "    3. If profile is corrupt: pnpm run tiktok:rotate && pnpm run tiktok:recover"
  fi
  exit 1
fi

# ── 4. Clear lockfile ────────────────────────────────────────────────────────
echo ""
if [ -f "$COOLDOWN_LOCK" ]; then
  rm -f "$COOLDOWN_LOCK"
  echo "$TAG Cleared cooldown lockfile."
else
  echo "$TAG No cooldown lockfile to clear."
fi

# ── 5. Healthcheck ────────────────────────────────────────────────────────────
echo ""
echo "$TAG Running healthcheck..."
echo ""

set +e
pnpm run tiktok:healthcheck
health_rc=$?
set -e

if [ $health_rc -ne 0 ]; then
  echo ""
  echo "$TAG Healthcheck failed (exit $health_rc) even after bootstrap."
  echo ""
  echo "  Next steps:"
  echo "    1. Check the healthcheck output above for details"
  echo "    2. If session still invalid: pnpm run tiktok:rotate && pnpm run tiktok:recover"
  exit 1
fi

# ── 6. Optional regression ────────────────────────────────────────────────────
if [ "$WITH_REGRESSION" = true ]; then
  echo ""
  echo "$TAG Running full regression harness..."
  echo ""
  set +e
  TIKTOK_HEADLESS=true pnpm run tiktok:regression
  reg_rc=$?
  set -e

  if [ $reg_rc -ne 0 ]; then
    echo ""
    echo "$TAG Regression failed (exit $reg_rc) but session is valid."
    echo "  This may indicate selector changes on TikTok's side."
    echo "  Uploads may still work — check with a dry run:"
    echo "    TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --dry-run"
  fi
fi

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Recovery Complete"
echo "=========================================="
echo ""
echo "  Session: VALID"
echo "  Cooldown lockfile: CLEARED"
echo "  Healthcheck: PASSED"
echo ""
echo "  The system is ready for overnight runs."
echo ""
