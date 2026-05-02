#!/bin/bash
# run-launchd.sh — launchd entrypoint for the QA bot.
#
# Sources env from ~/.flashflow-qa-bot.env, then runs:
#   1. run-qa.ts   (browser checks + screenshots)
#   2. archive.sh  (mirror to vault)
#   3. notify.ts   (Telegram on failure)
#
# Lives in scripts/qa-bot/ alongside the TS code so the launchd plist can
# point to it via __SCRIPT_PATH__.

set -uo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$HERE/../.." && pwd)"

ENV_FILE="$HOME/.flashflow-qa-bot.env"
LOG_DIR="$HOME/Library/Logs/FlashFlow"
mkdir -p "$LOG_DIR"

# Source env file if present.
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

TARGET="${QA_BOT_TARGET:-https://flashflowai.com}"

cd "$REPO_ROOT"

NPX="$(command -v npx || true)"
if [ -z "$NPX" ]; then
  if [ -x /opt/homebrew/bin/npx ]; then NPX=/opt/homebrew/bin/npx;
  elif [ -x /usr/local/bin/npx ]; then NPX=/usr/local/bin/npx;
  else
    echo "[qa-launchd] FATAL: npx not in PATH" >&2
    exit 1
  fi
fi

echo "[qa-launchd] $(date -u +%FT%TZ) starting run target=$TARGET"

# --notify and --archive let the TS script orchestrate the helpers
# (so we don't have to glue stages together in bash).
"$NPX" tsx "$HERE/run-qa.ts" "--target=$TARGET" --notify --archive
EXIT=$?

echo "[qa-launchd] $(date -u +%FT%TZ) exit=$EXIT"
exit "$EXIT"
