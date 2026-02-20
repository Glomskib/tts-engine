#!/bin/bash
# Download standalone yt-dlp binary for production (Vercel/Linux).
# This script runs during `vercel build` via the build command.
# On macOS (local dev), yt-dlp is installed via Homebrew — this script is skipped.

set -e

BIN_DIR="$(dirname "$0")/../bin"
mkdir -p "$BIN_DIR"

# Only download if not already present and we're on Linux (Vercel)
if [ "$(uname)" = "Linux" ] && [ ! -f "$BIN_DIR/yt-dlp" ]; then
  echo "[install-yt-dlp] Downloading standalone yt-dlp for Linux..."
  curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o "$BIN_DIR/yt-dlp"
  chmod +x "$BIN_DIR/yt-dlp"
  echo "[install-yt-dlp] Installed yt-dlp to $BIN_DIR/yt-dlp"
  "$BIN_DIR/yt-dlp" --version
else
  echo "[install-yt-dlp] Skipping ($(uname) / binary already exists or using system yt-dlp)"
fi
