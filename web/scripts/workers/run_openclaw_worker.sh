#!/usr/bin/env bash
set -euo pipefail

cd /Users/brandonglomski/tts-engine/web

# Load env
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

# Make sure logs dir exists
mkdir -p logs/workers

# Run forever; if it exits, relaunchd will restart it anyway, but this helps for transient exits
exec npx tsx scripts/workers/openclaw_worker.ts >> logs/workers/openclaw_worker.launchd.log 2>&1
