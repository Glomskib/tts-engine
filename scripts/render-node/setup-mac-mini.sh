#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# FlashFlow Mac Mini Render Node — One-Command Setup
# Run: bash setup-mac-mini.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
BOLD="\033[1m"
TEAL="\033[0;36m"
GREEN="\033[0;32m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${TEAL}FlashFlow Render Node Setup${RESET}"
echo "────────────────────────────"

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
echo -e "\n${BOLD}[1/6] Checking Node.js...${RESET}"
if ! command -v node &>/dev/null; then
  echo -e "${RED}Node.js not found. Install from https://nodejs.org (v20+)${RESET}"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✓ Node.js $NODE_VER${RESET}"

# ── 2. Check FFmpeg ───────────────────────────────────────────────────────────
echo -e "\n${BOLD}[2/6] Checking FFmpeg...${RESET}"
if ! command -v ffmpeg &>/dev/null; then
  echo "FFmpeg not found. Installing via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo -e "${RED}Homebrew not found. Install from https://brew.sh${RESET}"
    exit 1
  fi
  brew install ffmpeg
fi
FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')
echo -e "${GREEN}✓ FFmpeg $FFMPEG_VER${RESET}"

# ── 3. Install npm dependencies ───────────────────────────────────────────────
echo -e "\n${BOLD}[3/6] Installing dependencies...${RESET}"
npm install
echo -e "${GREEN}✓ Dependencies installed${RESET}"

# ── 4. Configure environment ──────────────────────────────────────────────────
echo -e "\n${BOLD}[4/6] Configuring environment...${RESET}"
if [ ! -f .env ]; then
  if [ -f .env.render-node.example ]; then
    cp .env.render-node.example .env
    echo -e "${TEAL}Created .env from example. Please edit it now:${RESET}"
    echo ""
    echo "  nano .env"
    echo ""
    echo "Required values:"
    echo "  FLASHFLOW_API_URL      — your Vercel deployment URL"
    echo "  RENDER_NODE_SECRET     — matches Vercel RENDER_NODE_SECRET env var"
    echo "  RENDER_NODE_ID         — unique name for this machine"
    echo "  SUPABASE_URL           — your Supabase project URL"
    echo "  SUPABASE_SERVICE_ROLE_KEY"
    echo "  OPENAI_API_KEY"
    echo ""
    read -p "Press Enter after editing .env to continue..."
  else
    echo -e "${RED}.env.render-node.example not found${RESET}"
    exit 1
  fi
else
  echo -e "${GREEN}✓ .env already exists${RESET}"
fi

# ── 5. Create logs directory ──────────────────────────────────────────────────
echo -e "\n${BOLD}[5/6] Creating logs directory...${RESET}"
mkdir -p logs
echo -e "${GREEN}✓ logs/ created${RESET}"

# ── 6. Install & start PM2 ────────────────────────────────────────────────────
echo -e "\n${BOLD}[6/6] Setting up PM2...${RESET}"
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2 globally..."
  npm install -g pm2
fi
PM2_VER=$(pm2 -v)
echo -e "${GREEN}✓ PM2 $PM2_VER${RESET}"

pm2 start ecosystem.config.js
pm2 save

echo ""
echo -e "${BOLD}${GREEN}✓ FlashFlow Render Node is running!${RESET}"
echo ""
echo "To enable auto-start on reboot, run:"
echo -e "  ${TEAL}$(pm2 startup | tail -1)${RESET}"
echo ""
echo "Useful commands:"
echo "  pm2 logs flashflow-render    — view live logs"
echo "  pm2 status                   — check node status"
echo "  pm2 restart flashflow-render — restart after .env changes"
echo "  pm2 stop flashflow-render    — stop the node"
