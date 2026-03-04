#!/usr/bin/env bash
set -euo pipefail
#
# marketing-clis.sh — Idempotent installer for FlashFlow marketing pipeline CLIs
#
# Usage:
#   scripts/setup/marketing-clis.sh           # install missing, verify all
#   scripts/setup/marketing-clis.sh --check   # verify only, no install
#

CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

PASS=0
FAIL=0
INSTALLED=0

_ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
_miss() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
_inst() { echo "  ⬇ Installing $1..."; INSTALLED=$((INSTALLED + 1)); }

_check_or_install() {
  local name="$1"
  local check_cmd="$2"
  local install_cmd="$3"

  if eval "$check_cmd" >/dev/null 2>&1; then
    local ver
    ver=$(eval "$check_cmd" 2>&1 | head -1)
    _ok "$name — $ver"
  elif [ "$CHECK_ONLY" = true ]; then
    _miss "$name — NOT INSTALLED"
  else
    _inst "$name"
    eval "$install_cmd" >/dev/null 2>&1
    if eval "$check_cmd" >/dev/null 2>&1; then
      local ver
      ver=$(eval "$check_cmd" 2>&1 | head -1)
      _ok "$name — $ver (just installed)"
    else
      _miss "$name — INSTALL FAILED"
    fi
  fi
}

echo "=== FlashFlow Marketing CLI Verification ==="
echo ""

# ── A) Core shell/data tooling ──────────────────────────────────
echo "A) Core shell/data tooling"
_check_or_install "jq"      "jq --version"           "brew install jq"
_check_or_install "yq"      "yq --version"           "brew install yq"
_check_or_install "ripgrep"  "rg --version"           "brew install ripgrep"
_check_or_install "fd"      "fd --version"            "brew install fd"
_check_or_install "curl"    "curl --version"          "echo 'curl should be pre-installed'"
_check_or_install "git"     "git --version"           "echo 'git should be pre-installed'"
echo ""

# ── B) Media + creative pipeline ────────────────────────────────
echo "B) Media + creative pipeline"
_check_or_install "ffmpeg"      "ffmpeg -version"                "brew install ffmpeg"
_check_or_install "imagemagick" "magick --version"               "brew install imagemagick"
_check_or_install "exiftool"    "exiftool -ver"                  "brew install exiftool"
_check_or_install "python3"     "python3 --version"              "echo 'python3 should be pre-installed'"
_check_or_install "pipx"        "pipx --version"                 "brew install pipx"
_check_or_install "playwright"  "npx playwright --version"       "npx playwright install"
echo ""

# ── C) Developer/infra tools ────────────────────────────────────
echo "C) Developer/infra tools"
_check_or_install "gh"         "gh --version"          "brew install gh"
_check_or_install "supabase"   "supabase --version"    "brew install supabase/tap/supabase"
_check_or_install "vercel"     "vercel --version"      "npm install -g vercel"
_check_or_install "late"       "late --version"        "npm install -g @getlatedev/cli"
echo ""

# ── D) Content ingestion ────────────────────────────────────────
echo "D) Content ingestion"
_check_or_install "yt-dlp"     "yt-dlp --version"     "brew install yt-dlp"
echo ""

# ── Summary ─────────────────────────────────────────────────────
echo "=== Results: $PASS passed, $FAIL failed, $INSTALLED installed ==="
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
