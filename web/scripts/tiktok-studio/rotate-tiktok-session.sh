#!/usr/bin/env bash
set -euo pipefail
#
# Rotate TikTok Session
#
# Archives the current browser profile and clears session state,
# preparing for a fresh bootstrap login.
#
# Safety: refuses to run if a browser lock is detected (override with FORCE=1).
#
# Usage:
#   ./scripts/tiktok-studio/rotate-tiktok-session.sh
#   FORCE=1 ./scripts/tiktok-studio/rotate-tiktok-session.sh
#   npm run tiktok:rotate
#
# What it does:
#   1. Checks for active browser lock (SingletonLock)
#   2. Creates a backup (calls backup-tiktok-session.sh)
#   3. Moves profile dir to timestamped archive
#   4. Removes storageState, meta, and cooldown lockfile
#   5. Prints the bootstrap command to re-login
#
# Exit codes:
#   0 = rotated successfully — run bootstrap next
#   1 = error or refused (active lock without FORCE=1)

TAG="[rotate]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SESSIONS_DIR="$WEB_DIR/data/sessions"
PROFILE_DIR="$SESSIONS_DIR/tiktok-studio-profile"
ARCHIVE_DIR="$SESSIONS_DIR/archived"
COOLDOWN_LOCK="$SESSIONS_DIR/.session-invalid.lock"
FORCE="${FORCE:-0}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

echo "=== TikTok Session Rotation ==="
echo ""

# ── 1. Check profile exists ──────────────────────────────────────────────────
if [ ! -d "$PROFILE_DIR" ]; then
  echo "$TAG No profile directory to rotate: $PROFILE_DIR"
  echo "$TAG Nothing to do. Run bootstrap to create a new session."
  echo ""
  echo "  cd $WEB_DIR && pnpm run tiktok:bootstrap"
  exit 0
fi

# ── 2. Check for active browser lock ─────────────────────────────────────────
if [ -f "$PROFILE_DIR/SingletonLock" ]; then
  if [ "$FORCE" = "1" ]; then
    echo "$TAG WARN: SingletonLock exists but FORCE=1 — proceeding anyway."
    echo "$TAG Removing stale lock files..."
    rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie"
  else
    echo "$TAG REFUSED: Browser lock detected at $PROFILE_DIR/SingletonLock"
    echo "$TAG A browser or upload may be running against this profile."
    echo ""
    echo "  To override: FORCE=1 $0"
    echo "  To check:    ps aux | grep -i chromium | grep tiktok-studio-profile"
    exit 1
  fi
fi

# ── 3. Create backup first ───────────────────────────────────────────────────
echo "$TAG Creating backup before rotation..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -x "$SCRIPT_DIR/backup-tiktok-session.sh" ]; then
  "$SCRIPT_DIR/backup-tiktok-session.sh"
else
  echo "$TAG WARN: backup script not found/executable — skipping backup"
fi
echo ""

# ── 4. Archive current profile ───────────────────────────────────────────────
mkdir -p "$ARCHIVE_DIR"
archive_dest="$ARCHIVE_DIR/tiktok-studio-profile-$TIMESTAMP"
echo "$TAG Archiving profile to: $archive_dest"
mv "$PROFILE_DIR" "$archive_dest"

# ── 5. Clear session files ───────────────────────────────────────────────────
echo "$TAG Clearing session artifacts..."

for f in \
  "$SESSIONS_DIR/tiktok-studio.storageState.json" \
  "$SESSIONS_DIR/tiktok-studio.meta.json" \
  "$COOLDOWN_LOCK"; do
  if [ -f "$f" ]; then
    echo "  Removed: $(basename "$f")"
    rm "$f"
  fi
done

# ── 6. Prune old archives (keep last 3) ──────────────────────────────────────
archive_count=$(ls -1d "$ARCHIVE_DIR"/tiktok-studio-profile-* 2>/dev/null | wc -l | tr -d ' ')
if [ "$archive_count" -gt 3 ]; then
  prune_count=$((archive_count - 3))
  echo "$TAG Pruning $prune_count oldest archive(s)..."
  ls -1dt "$ARCHIVE_DIR"/tiktok-studio-profile-* | tail -n "$prune_count" | while read -r old; do
    echo "  Removing: $(basename "$old")"
    rm -rf "$old"
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Rotation Complete ==="
echo ""
echo "  Old profile archived to: $archive_dest"
echo "  Session files cleared."
echo ""
echo "  Next step — bootstrap a fresh session:"
echo ""
echo "    cd $WEB_DIR && pnpm run tiktok:bootstrap"
echo ""
echo "  Then verify:"
echo ""
echo "    pnpm run tiktok:check-session"
echo ""
