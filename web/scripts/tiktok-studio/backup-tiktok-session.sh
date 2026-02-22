#!/usr/bin/env bash
set -euo pipefail
#
# Backup TikTok Session
#
# Creates a timestamped tar.gz of the browser profile + storageState.
# Stores backups in data/sessions/backups/ and prunes old ones.
#
# Usage:
#   ./scripts/tiktok-studio/backup-tiktok-session.sh
#   npm run tiktok:backup
#
# Env vars:
#   TIKTOK_BACKUP_KEEP=10   — number of backups to keep (default: 10)
#
# Exit codes:
#   0 = backup created successfully
#   1 = error (profile missing, tar failed, etc.)

TAG="[backup]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SESSIONS_DIR="$WEB_DIR/data/sessions"
PROFILE_DIR="$SESSIONS_DIR/tiktok-studio-profile"
BACKUP_DIR="$SESSIONS_DIR/backups"
KEEP="${TIKTOK_BACKUP_KEEP:-10}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/tiktok-session-$TIMESTAMP.tar.gz"

echo "=== TikTok Session Backup ==="
echo ""

# ── Preflight ─────────────────────────────────────────────────────────────────
if [ ! -d "$PROFILE_DIR" ]; then
  echo "$TAG FAIL: Profile directory does not exist: $PROFILE_DIR"
  echo "$TAG Run 'pnpm run tiktok:bootstrap' first."
  exit 1
fi

# Check for active browser lock (Chromium holds SingletonLock while running)
if [ -f "$PROFILE_DIR/SingletonLock" ]; then
  echo "$TAG WARN: SingletonLock exists — a browser may be running."
  echo "$TAG Backup will proceed but may capture inconsistent state."
  echo "$TAG For a clean backup, stop all uploads first."
fi

# ── Create backup ─────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "$TAG Source:  $SESSIONS_DIR"
echo "$TAG Target:  $BACKUP_FILE"

# Build list of files to include
include_args=()
if [ -d "$PROFILE_DIR" ]; then
  include_args+=("tiktok-studio-profile")
fi
if [ -f "$SESSIONS_DIR/tiktok-studio.storageState.json" ]; then
  include_args+=("tiktok-studio.storageState.json")
fi
if [ -f "$SESSIONS_DIR/tiktok-studio.meta.json" ]; then
  include_args+=("tiktok-studio.meta.json")
fi

tar czf "$BACKUP_FILE" -C "$SESSIONS_DIR" "${include_args[@]}"

size=$(du -h "$BACKUP_FILE" | cut -f1)
echo "$TAG Created: $BACKUP_FILE ($size)"

# ── Prune old backups ─────────────────────────────────────────────────────────
backup_count=$(ls -1 "$BACKUP_DIR"/tiktok-session-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
echo "$TAG Backups on disk: $backup_count (keep=$KEEP)"

if [ "$backup_count" -gt "$KEEP" ]; then
  prune_count=$((backup_count - KEEP))
  echo "$TAG Pruning $prune_count oldest backup(s)..."
  ls -1t "$BACKUP_DIR"/tiktok-session-*.tar.gz | tail -n "$prune_count" | while read -r old; do
    echo "  Removing: $(basename "$old")"
    rm "$old"
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "$TAG Done. Backups:"
ls -lh "$BACKUP_DIR"/tiktok-session-*.tar.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
echo ""
