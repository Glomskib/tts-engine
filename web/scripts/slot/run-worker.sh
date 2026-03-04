#!/usr/bin/env bash
set -euo pipefail
#
# Slot-Aware OpenClaw Worker Launcher
#
# Loads slot config via the client-slots loader, injects FF_CLIENT_ID
# and FF_CHROME_PROFILE_DIR into the environment, then runs the
# standard worker script.
#
# Usage:
#   scripts/slot/run-worker.sh --slot wife
#   FF_SLOT=wife scripts/slot/run-worker.sh
#
# For launchd, pass --slot via ProgramArguments or set FF_SLOT
# in EnvironmentVariables.

TAG="[worker:slot]"
WEB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# ── Load .env.local ────────────────────────────────────────────────────────
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$WEB_DIR/.env.local"
  set +a
fi

# ── Resolve slot name from --slot arg or FF_SLOT env ─────────────────────
SLOT_NAME="${FF_SLOT:-}"

for i in "$@"; do
  case "$i" in
    --slot)
      shift
      SLOT_NAME="$1"
      shift
      ;;
    --slot=*)
      SLOT_NAME="${i#*=}"
      shift
      ;;
  esac
done

if [ -z "$SLOT_NAME" ]; then
  echo "$TAG FATAL: No slot specified. Use --slot <name> or set FF_SLOT."
  echo "$TAG Example: $0 --slot wife"
  exit 1
fi

# ── Load slot config via Node helper ──────────────────────────────────────
CONFIG_FILE="$WEB_DIR/config/client-slots.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "$TAG FATAL: $CONFIG_FILE not found."
  echo "$TAG Copy config/client-slots.example.json and fill in values."
  exit 1
fi

# Extract slot fields using Node (reliable JSON parsing)
SLOT_JSON=$(node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
  const slot = cfg.slots.find(s => s.slot === '$SLOT_NAME');
  if (!slot) {
    const avail = cfg.slots.map(s => s.slot).join(', ');
    console.error('Slot \"$SLOT_NAME\" not found. Available: ' + avail);
    process.exit(1);
  }
  console.log(JSON.stringify(slot));
")

CLIENT_ID=$(echo "$SLOT_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); console.log(JSON.parse(d).client_id)")
CHROME_DIR=$(echo "$SLOT_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); console.log(JSON.parse(d).chrome_profile_dir)")

export FF_SLOT="$SLOT_NAME"
export FF_CLIENT_ID="$CLIENT_ID"
export FF_CHROME_PROFILE_DIR="$CHROME_DIR"
export TIKTOK_BROWSER_PROFILE="$CHROME_DIR"

echo "$TAG Slot: $SLOT_NAME"
echo "$TAG Client ID: $CLIENT_ID"
echo "$TAG Chrome Profile: $CHROME_DIR"
echo ""

# ── Make sure logs dir exists ──────────────────────────────────────────────
mkdir -p "$WEB_DIR/logs/workers"

# ── Run the worker ─────────────────────────────────────────────────────────
cd "$WEB_DIR"
exec npx tsx scripts/workers/openclaw_worker.ts \
  >> "logs/workers/openclaw_worker.${SLOT_NAME}.log" 2>&1
