#!/bin/bash
# install-render-worker-on-mini.sh
# ─────────────────────────────────────────────────────────────────────────────
# Sets up the FlashFlow editor render-worker on a Mac mini under launchd.
#
# Steps:
#   1. Verifies SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set in env (or
#      reads them from ~/.flashflow-render-worker.env).
#   2. Ensures ~/Library/Logs/FlashFlow exists.
#   3. Renders the .plist template with paths substituted.
#   4. Loads the launch agent and verifies it's running.
#
# Run on the mini directly, OR rsync this script + scripts/render-worker.ts
# from MBP via:
#   rsync -av scripts/render-worker.ts scripts/com.flashflow.render-worker.plist \
#     scripts/install-render-worker-on-mini.sh \
#     mini:~/tts-engine/scripts/
# ssh mini 'bash ~/tts-engine/scripts/install-render-worker-on-mini.sh'
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_PATH="${REPO_PATH:-$HOME/tts-engine}"
SCRIPT_PATH="$REPO_PATH/scripts/render-worker.ts"
PLIST_TEMPLATE="$REPO_PATH/scripts/com.flashflow.render-worker.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.flashflow.render-worker.plist"
LOG_DIR="$HOME/Library/Logs/FlashFlow"
ENV_FILE="$HOME/.flashflow-render-worker.env"

echo "── FlashFlow render-worker installer"
echo "    repo:       $REPO_PATH"
echo "    script:     $SCRIPT_PATH"
echo "    plist dest: $PLIST_DEST"
echo "    log dir:    $LOG_DIR"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "FATAL: $SCRIPT_PATH not found — rsync the repo first." >&2
  exit 1
fi
if [ ! -f "$PLIST_TEMPLATE" ]; then
  echo "FATAL: $PLIST_TEMPLATE not found." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_DEST")"

# ── Env file ──────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# FlashFlow render-worker env. Fill these in before reloading launchd.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RENDER_WORKER_NAME=render-worker-mini
RENDER_WORKER_BUCKET=edit-jobs
EOF
  chmod 600 "$ENV_FILE"
  echo "WROTE $ENV_FILE — fill in SUPABASE_URL + SERVICE_ROLE_KEY then re-run."
  exit 0
fi

# Source the env file to verify required values are present.
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "FATAL: $ENV_FILE missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" >&2
  exit 1
fi

# ── Render plist with paths + env ─────────────────────────────────────────
# The launchd plist references the env file via a shell wrapper in
# ProgramArguments; for simplicity we substitute env values directly.

NPX_PATH="$(command -v npx || true)"
if [ -z "$NPX_PATH" ]; then
  # Try common Homebrew location
  if [ -x "/opt/homebrew/bin/npx" ]; then
    NPX_PATH="/opt/homebrew/bin/npx"
  elif [ -x "/usr/local/bin/npx" ]; then
    NPX_PATH="/usr/local/bin/npx"
  else
    echo "FATAL: npx not found in PATH" >&2
    exit 1
  fi
fi

# Build plist via sed substitutions.
TMP_PLIST=$(mktemp)
sed \
  -e "s|/usr/local/bin/npx|$NPX_PATH|g" \
  -e "s|__SCRIPT_PATH__|$SCRIPT_PATH|g" \
  -e "s|__REPO_PATH__|$REPO_PATH|g" \
  -e "s|__HOME__|$HOME|g" \
  "$PLIST_TEMPLATE" > "$TMP_PLIST"

# Inject env vars from $ENV_FILE into the EnvironmentVariables dict.
# Approach: use plutil to merge — fall back to sed string-replace if plutil
# fails (older macOS).
python3 - "$TMP_PLIST" "$ENV_FILE" <<'PYEOF'
import plistlib, sys, os
plist_path, env_path = sys.argv[1], sys.argv[2]
with open(plist_path, 'rb') as f:
    pl = plistlib.load(f)
ev = pl.setdefault('EnvironmentVariables', {})
with open(env_path) as ef:
    for line in ef:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        ev[k.strip()] = v.strip()
# PATH must include node/npm location so launchd can find npx
ev.setdefault('PATH', '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin')
with open(plist_path, 'wb') as f:
    plistlib.dump(pl, f)
print(f"merged {len(ev)} env vars into plist")
PYEOF

# Move final plist into place + reload launchd
mv "$TMP_PLIST" "$PLIST_DEST"

# Unload first if already loaded
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load -w "$PLIST_DEST"

echo
echo "── Loaded com.flashflow.render-worker"
launchctl list | grep com.flashflow.render-worker || true
echo
echo "Logs: tail -f $LOG_DIR/render-worker.out.log"
echo "Stop: launchctl unload $PLIST_DEST"
