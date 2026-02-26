#!/usr/bin/env bash
# with-lock.sh — mkdir-based atomic lock wrapper
# Usage: ./with-lock.sh <lock-name> <command...>
# Exits 0 if lock is already held (prints LOCKED message).

set -euo pipefail

LOCK_NAME="${1:?Usage: with-lock.sh <lock-name> <command...>}"
shift
CMD=("$@")

LOCK_DIR="$(cd "$(dirname "$0")/../../.runtime/locks" && pwd)/${LOCK_NAME}"

cleanup() {
  rm -rf "$LOCK_DIR"
}

# Try to acquire lock (mkdir is atomic on all POSIX systems)
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  OWNER_PID="unknown"
  [ -f "$LOCK_DIR/pid" ] && OWNER_PID=$(cat "$LOCK_DIR/pid")
  echo "LOCKED ${LOCK_NAME} by ${OWNER_PID}"
  exit 0
fi

trap cleanup EXIT INT TERM HUP

# Write lock metadata
echo $$ > "$LOCK_DIR/pid"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LOCK_DIR/started"

"${CMD[@]}"
