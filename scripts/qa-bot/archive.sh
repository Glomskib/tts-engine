#!/bin/bash
# archive.sh — Mirror a QA run into the vault and push it.
#
# Usage:
#   bash scripts/qa-bot/archive.sh /path/to/qa-runs/<timestamp>
#
# Effect:
#   1. Copies SUMMARY.md, result.json, and *.png into
#      ~/Documents/MacBook Pro VAULT/90-Logbook/qa-runs/<timestamp>/
#   2. git add + commit + push (best-effort — non-fatal)
#
# Designed to be safe to run on the Mac mini (which mirrors the vault at
# ~/openclaw-workspace/vault/) — set VAULT_ROOT to override.

set -euo pipefail

SRC_DIR="${1:-}"
if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  echo "[qa-archive] usage: archive.sh <qa-runs/timestamp dir>" >&2
  exit 1
fi

# Detect vault root — prefer MBP path, fall back to mini mirror.
VAULT_ROOT="${VAULT_ROOT:-}"
if [ -z "$VAULT_ROOT" ]; then
  if [ -d "$HOME/Documents/MacBook Pro VAULT" ]; then
    VAULT_ROOT="$HOME/Documents/MacBook Pro VAULT"
  elif [ -d "$HOME/openclaw-workspace/vault" ]; then
    VAULT_ROOT="$HOME/openclaw-workspace/vault"
  else
    echo "[qa-archive] no vault found at expected locations — skipping archive."
    echo "[qa-archive] (set VAULT_ROOT=<dir> to override)"
    exit 0
  fi
fi

TS="$(basename "$SRC_DIR")"
DEST_DIR="$VAULT_ROOT/90-Logbook/qa-runs/$TS"
mkdir -p "$DEST_DIR"

# Copy summary + json always; copy screenshots (but skip if huge).
cp -f "$SRC_DIR/SUMMARY.md" "$DEST_DIR/" 2>/dev/null || true
cp -f "$SRC_DIR/result.json" "$DEST_DIR/" 2>/dev/null || true

# Copy screenshots referenced by the summary (failure shots prioritised by
# ordering in SUMMARY.md, but we just copy them all — they're small PNGs).
shopt -s nullglob
for img in "$SRC_DIR"/*.png; do
  cp -f "$img" "$DEST_DIR/" 2>/dev/null || true
done
shopt -u nullglob

echo "[qa-archive] copied to $DEST_DIR"

# Git commit + push (best-effort, only if VAULT_ROOT is a git repo).
if [ -d "$VAULT_ROOT/.git" ]; then
  (
    cd "$VAULT_ROOT"
    git add "90-Logbook/qa-runs/$TS" 2>/dev/null || true
    if ! git diff --cached --quiet; then
      git -c user.email='qa-bot@flashflowai.com' \
          -c user.name='FlashFlow QA Bot' \
          commit -m "qa: run $TS" >/dev/null 2>&1 || true
      git push origin HEAD >/dev/null 2>&1 || \
        echo "[qa-archive] git push failed (non-fatal — vault still updated locally)"
      echo "[qa-archive] vault commit pushed."
    else
      echo "[qa-archive] no vault changes to commit."
    fi
  )
else
  echo "[qa-archive] vault is not a git repo — skipped commit/push."
fi
