#!/usr/bin/env bash

# ==============================================================================
# ⚡ EulerX0 MD - One-Command Automated Installer & Deployment Script
# 👑 Developer: Ayoubvvch
# 🌐 Repository: https://github.com/Ayoubvvch/EulerX0-MD
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "  ______      _           __   __  ___  __  ___ "
echo " |  ____|    | |          \ \ / / / _ \ |  \/  |"
echo " | |__  _   _| | ___ _ __  \ V / | | | || \  / |"
echo " |  __|| | | | |/ _ \ '__|  > <  | | | || |\/| |"
echo " | |___| |_| | |  __/ |    / . \ | |_| || |  | |"
echo " |______\__,_|_|\___|_|   /_/ \_\ \___(_)_|  |_|"
echo "                                                "
echo -e "${NC}"
echo -e "${BLUE}⚡ Starting EulerX0 MD Automated Installation...${NC}\n"

# 1. Check Root / Sudo
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
else
    SUDO=""
fi

# 2. Update System Packages & Install Core Tools
echo -e "${YELLOW}[1/6] Updating system & installing required packages...${NC}"
$SUDO apt-get update -y
$SUDO apt-get install -y curl git ffmpeg sqlite3 python3 python3-pip jq build-essential

# 3. Check and Install Node.js (v20+ LTS)
echo -e "${YELLOW}[2/6] Checking Node.js environment...${NC}"
if ! command -v node > /dev/null 2>&1 || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]; then
    echo -e "${CYAN}Installing Node.js 22.x LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
fi
echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"

# 4. Install & Update yt-dlp binary
echo -e "${YELLOW}[3/6] Installing latest yt-dlp binary...${NC}"
if ! command -v yt-dlp > /dev/null 2>&1; then
    $SUDO curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    $SUDO chmod a+rx /usr/local/bin/yt-dlp
else
    $SUDO yt-dlp -U > /dev/null 2>&1 || true
fi
echo -e "${GREEN}✓ yt-dlp installed at /usr/local/bin/yt-dlp${NC}"

# 5. Install Global PM2 Supervisor
echo -e "${YELLOW}[4/6] Installing PM2 process supervisor...${NC}"
if ! command -v pm2 > /dev/null 2>&1; then
    $SUDO npm install -g pm2
fi

# 6. Clone or Navigate to Project Directory
INSTALL_DIR="$HOME/eulerx0-md"
if [ ! -f "package.json" ]; then
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${CYAN}Updating existing repository in $INSTALL_DIR...${NC}"
        cd "$INSTALL_DIR"
        git pull origin main || true
    else
        echo -e "${CYAN}Cloning EulerX0 MD repository...${NC}"
        git clone https://github.com/Ayoubvvch/EulerX0-MD.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
fi

# 7. Create config.env if not exists
if [ ! -f "config.env" ]; then
    echo -e "${YELLOW}[5/6] Creating default config.env...${NC}"
    cat << 'EOF' > config.env
SESSION=EX0~AcMods
BOT_NAME=EulerX0 MD
MODE=public
HANDLERS=false
SUDO=212614389153
TZ=Africa/Casablanca
PORT=3000
DASHBOARD_PORT=5000
AUTO_READ_STATUS=false
READ_MESSAGES=false
ALWAYS_ONLINE=false
DISABLE_START_MESSAGE=false
EOF
fi

# Ensure directories exist
mkdir -p temp sessions

# 8. Install NPM Dependencies
echo -e "${YELLOW}[6/6] Installing clean Node dependencies...${NC}"
npm install --omit=dev

# 9. Start / Restart with PM2
echo -e "${CYAN}Starting EulerX0 MD with PM2...${NC}"
pm2 startOrRestart ecosystem.config.cjs
pm2 save

SERVER_IP=$(curl -s https://api.ipify.org || echo "YOUR_SERVER_IP")

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 EulerX0 MD has been successfully installed and started!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "🌐 *Web Dashboard & QR Pairing:*  ${CYAN}http://${SERVER_IP}:5000${NC}"
echo -e "📊 *Health Endpoint:*             ${CYAN}http://${SERVER_IP}:3000/health${NC}"
echo -e "📜 *View Live Logs:*              ${YELLOW}pm2 logs eulerx0-bot${NC}"
echo -e "🔄 *Restart Bot:*                 ${YELLOW}pm2 restart eulerx0-bot${NC}"
echo -e "🛑 *Stop Bot:*                    ${YELLOW}pm2 stop all${NC}"
echo -e "${GREEN}================================================================${NC}\n"
