#!/bin/bash

# FamSync Kiosk Setup Script for Ubuntu
# This script sets up the FamSync application for kiosk mode on Ubuntu

set -e

echo "🚀 FamSync Kiosk Setup Script"
echo "============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Check Ubuntu version
if ! grep -q "Ubuntu" /etc/os-release; then
    print_warning "This script is designed for Ubuntu. Proceeding anyway..."
fi

print_status "Updating system packages..."
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# Install Node.js and npm
print_status "Installing Node.js and npm..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_status "Node.js version: $NODE_VERSION"
print_status "npm version: $NPM_VERSION"

# Install build dependencies
print_status "Installing build dependencies..."
sudo apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    git \
    curl \
    wget \
    unzip

# Install Electron dependencies
print_status "Installing Electron dependencies..."

# Pre-configure packages to avoid prompts
export DEBIAN_FRONTEND=noninteractive
sudo -E apt-get -qq update

# Install packages with automatic conflict resolution
print_status "Installing system packages..."
sudo -E apt-get install -y -qq \
    --no-install-recommends \
    --fix-missing \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" \
    -o APT::Get::Assume-Yes=true \
    libnss3-dev \
    libatk-bridge2.0-dev \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 || print_warning "Some packages may have failed, continuing..."

# Handle audio packages separately with fallbacks
print_status "Installing audio libraries..."
if ! sudo -E apt-get install -y -qq libasound2-dev 2>/dev/null; then
    if ! sudo -E apt-get install -y -qq libasound2t64 2>/dev/null; then
        print_warning "Audio library installation failed, skipping..."
    fi
fi

# Handle GTK packages
print_status "Installing GTK libraries..."
if ! sudo -E apt-get install -y -qq libgtk-3-dev 2>/dev/null; then
    if ! sudo -E apt-get install -y -qq libgtk-3-0t64 2>/dev/null; then
        sudo -E apt-get install -y -qq libgtk-3-0 || print_warning "GTK installation failed, skipping..."
    fi
fi

# Install project dependencies
print_status "Installing FamSync dependencies..."
npm install

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    print_status "Creating .env file from template..."
    cp .env.example .env
    print_warning "Please edit .env file with your API keys before running the application"
fi

# Build the application
print_status "Building FamSync application..."
npm run build

# Build Electron application for Linux
print_status "Building Electron application..."
npm run dist-linux

# Create kiosk user if it doesn't exist
KIOSK_USER="famsync"
if ! id "$KIOSK_USER" &>/dev/null; then
    print_status "Creating kiosk user: $KIOSK_USER"
    sudo useradd -m -s /bin/bash $KIOSK_USER
    sudo usermod -aG audio,video $KIOSK_USER
fi

# Create application directory
APP_DIR="/opt/famsync"
print_status "Creating application directory: $APP_DIR"
sudo mkdir -p $APP_DIR
sudo cp -r dist/* $APP_DIR/
sudo chown -R $KIOSK_USER:$KIOSK_USER $APP_DIR

# Create systemd service for kiosk mode
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/famsync-kiosk.service > /dev/null << EOF
[Unit]
Description=FamSync Kiosk Application
After=graphical-session.target

[Service]
Type=simple
User=$KIOSK_USER
Environment=DISPLAY=:0
Environment=HOME=/home/$KIOSK_USER
ExecStart=$APP_DIR/famsync-kiosk --kiosk --disable-web-security
Restart=always
RestartSec=10

[Install]
WantedBy=graphical-session.target
EOF

# Create X11 session script
print_status "Creating X11 session script..."
sudo tee /home/$KIOSK_USER/.xinitrc > /dev/null << 'EOF'
#!/bin/bash
xset s off         # disable screensaver
xset -dpms        # disable DPMS (Energy Star) features
xset s noblank    # don't blank the video device
unclutter -idle 0.5 -root &  # hide cursor when idle
exec $APP_DIR/famsync-kiosk --kiosk
EOF

sudo chmod +x /home/$KIOSK_USER/.xinitrc
sudo chown $KIOSK_USER:$KIOSK_USER /home/$KIOSK_USER/.xinitrc

# Configure autologin
print_status "Configuring autologin..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf > /dev/null << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF

# Create autostart script
print_status "Creating autostart script..."
sudo mkdir -p /home/$KIOSK_USER/.config/autostart
sudo tee /home/$KIOSK_USER/.config/autostart/famsync.desktop > /dev/null << EOF
[Desktop Entry]
Type=Application
Name=FamSync Kiosk
Exec=startx
NoDisplay=true
X-GNOME-Autostart-Phase=Applications
X-GNOME-Autostart-Notify=true
EOF

sudo chown -R $KIOSK_USER:$KIOSK_USER /home/$KIOSK_USER/.config

# Install touchscreen calibration tool (optional)
print_status "Installing touchscreen utilities..."
sudo apt-get install -y xinput-calibrator

# Create update script
print_status "Creating update script..."
sudo tee /usr/local/bin/update-famsync > /dev/null << 'EOF'
#!/bin/bash
cd /opt/famsync-source
git pull origin main
npm install
npm run build
npm run dist-linux
systemctl stop famsync-kiosk
cp -r dist/* /opt/famsync/
systemctl start famsync-kiosk
echo "FamSync updated successfully!"
EOF

sudo chmod +x /usr/local/bin/update-famsync

# Enable services
print_status "Enabling services..."
sudo systemctl daemon-reload
sudo systemctl enable famsync-kiosk

# Final instructions
print_status "Setup completed successfully! 🎉"
echo ""
echo "Next steps:"
echo "1. Edit /opt/famsync/.env with your Google Calendar API keys"
echo "2. Reboot the system: sudo reboot"
echo "3. The kiosk will start automatically after reboot"
echo ""
echo "Useful commands:"
echo "- Start kiosk: sudo systemctl start famsync-kiosk"
echo "- Stop kiosk: sudo systemctl stop famsync-kiosk"
echo "- View logs: sudo journalctl -u famsync-kiosk -f"
echo "- Update app: sudo update-famsync"
echo ""
echo "For touchscreen calibration, run: xinput_calibrator"

# Optional: Configure firewall
read -p "Do you want to configure UFW firewall? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Configuring firewall..."
    sudo ufw enable
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow ssh
    print_status "Firewall configured. Only SSH and outgoing connections allowed."
fi

print_status "FamSync Kiosk setup completed!"