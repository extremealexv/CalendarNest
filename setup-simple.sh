#!/bin/bash

# FamSync Kiosk - Alternative Simple Setup Script
# Use this if the main setup script encounters package conflicts

set -e

echo "🚀 FamSync Kiosk - Simple Setup"
echo "=============================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

print_status "Node.js version: $(node --version)"
print_status "npm version: $(npm --version)"

# Install only essential packages without problematic ones
print_status "Installing essential packages..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential \
    python3 \
    git \
    curl \
    wget

# Try to install Electron dependencies with fallbacks
print_status "Installing Electron dependencies (may skip some if conflicts)..."

# Install packages one by one to avoid conflicts
packages=(
    "libnss3-dev"
    "libatk-bridge2.0-dev" 
    "libdrm2"
    "libxcomposite1"
    "libxdamage1"
    "libxrandr2"
    "libgbm1"
    "libxss1"
)

for package in "${packages[@]}"; do
    print_status "Installing $package..."
    if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$package" 2>/dev/null; then
        echo "✓ $package installed successfully"
    else
        print_warning "Failed to install $package, skipping..."
    fi
done

# Try to install audio/GUI packages separately
print_status "Attempting to install GUI packages..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y libgtk-3-0 || print_warning "GTK installation had issues, continuing anyway..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y libasound2 || print_warning "Audio library installation had issues, continuing anyway..."

# Install project dependencies
print_status "Installing FamSync dependencies..."
npm install

# Create .env if needed
if [ ! -f .env ]; then
    print_status "Creating .env file..."
    cp .env.example .env
    print_warning "Please edit .env file with your API keys"
fi

# Build the application
print_status "Building application..."
npm run build

print_status "Simple setup completed! 🎉"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Google Calendar API keys"  
echo "2. Test with: npm start"
echo "3. For Electron: npm run electron-dev"
echo ""
echo "If you encounter issues, the app should still work in web mode."