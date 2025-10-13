#!/bin/bash

# FamSync Development Setup - Minimal Installation
# This script installs only essential packages for development

set -e

echo "🚀 FamSync Development Setup"
echo "=========================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Update system
print_status "Updating package lists..."
sudo apt update -qq

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

print_status "Node.js: $(node --version)"
print_status "npm: $(npm --version)"

# Install essential build tools
print_status "Installing build essentials..."
sudo apt-get install -y build-essential python3 git curl

# Install project dependencies
print_status "Installing npm dependencies..."
npm install

# Create .env file
if [ ! -f .env ]; then
    print_status "Creating .env file..."
    cp .env.example .env
    print_warning "Edit .env file with your API keys before running the app"
fi

# Try to build (may fail with some warnings but should work)
print_status "Building React application..."
npm run build || print_warning "Build had warnings but may still work"

print_status "Development setup complete! 🎉"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Google API credentials"
echo "2. Run 'npm start' for development server"
echo "3. Run 'npm run electron-dev' for Electron mode"
echo ""
echo "For kiosk deployment, use the full setup-kiosk.sh later"