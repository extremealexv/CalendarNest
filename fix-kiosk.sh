#!/bin/bash

# FamSync Kiosk User Setup and Fix Script
# This script fixes the missing kiosk user issue and sets up autologin

set -e  # Exit on any error

echo "🔧 FamSync Kiosk User Setup Fix"
echo "================================"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

echo "📋 Step 1: Creating kiosk user..."
# Create the kiosk user if it doesn't exist
if id "kiosk" &>/dev/null; then
    echo "✅ User 'kiosk' already exists"
else
    useradd -m -s /bin/bash kiosk
    echo "✅ Created user 'kiosk'"
fi

echo "📋 Step 2: Adding kiosk user to required groups..."
usermod -a -G audio,video,dialout kiosk
echo "✅ Added kiosk user to audio, video, dialout groups"

echo "📋 Step 3: Setting up autologin configuration..."
# Create autologin override directory
mkdir -p /etc/systemd/system/getty@tty1.service.d

# Create autologin override file
cat > /etc/systemd/system/getty@tty1.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --noissue --autologin kiosk %I $TERM
Type=idle
EOF
echo "✅ Created autologin configuration"

echo "📋 Step 4: Creating .xinitrc for kiosk user..."
# Create .xinitrc file for kiosk user
sudo -u kiosk tee /home/kiosk/.xinitrc > /dev/null << 'EOF'
#!/bin/bash
# FamSync Kiosk Startup Script
# This starts the X server and launches the FamSync application

# Set display
export DISPLAY=:0

# Start X server in background if not already running
if ! pgrep -x "Xorg" > /dev/null; then
    startx &
    sleep 3
fi

# Launch FamSync application
if [ -f "/home/kiosk/FamSync.AppImage" ]; then
    exec /home/kiosk/FamSync.AppImage
else
    echo "❌ FamSync.AppImage not found at /home/kiosk/FamSync.AppImage"
    echo "Please copy the AppImage to this location"
    exit 1
fi
EOF

# Make .xinitrc executable
chmod +x /home/kiosk/.xinitrc
chown kiosk:kiosk /home/kiosk/.xinitrc
echo "✅ Created .xinitrc for kiosk user"

echo "📋 Step 5: Setting up FamSync application..."
# Check if FamSync.AppImage exists in common locations and copy it
APPIMAGE_LOCATIONS=(
    "/tmp/FamSync.AppImage"
    "./dist/FamSync.AppImage" 
    "$(pwd)/dist/FamSync.AppImage"
    "/home/$(logname)/CalendarNest/dist/FamSync.AppImage"
)

FOUND_APPIMAGE=""
for location in "${APPIMAGE_LOCATIONS[@]}"; do
    if [ -f "$location" ]; then
        FOUND_APPIMAGE="$location"
        break
    fi
done

if [ -n "$FOUND_APPIMAGE" ]; then
    cp "$FOUND_APPIMAGE" /home/kiosk/FamSync.AppImage
    chown kiosk:kiosk /home/kiosk/FamSync.AppImage
    chmod +x /home/kiosk/FamSync.AppImage
    echo "✅ Copied FamSync.AppImage from $FOUND_APPIMAGE"
else
    echo "⚠️  FamSync.AppImage not found in common locations"
    echo "   Please manually copy it to /home/kiosk/FamSync.AppImage after building"
    echo "   You can build it by running: npm run dist-linux"
fi

echo "📋 Step 6: Updating systemd service configuration..."
# Update the systemd service to use proper dependencies
cat > /etc/systemd/system/famsync-kiosk.service << 'EOF'
[Unit]
Description=FamSync Kiosk Application
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
User=kiosk
Group=kiosk
Environment=DISPLAY=:0
Environment=HOME=/home/kiosk
WorkingDirectory=/home/kiosk
ExecStartPre=/bin/sleep 5
ExecStart=/home/kiosk/FamSync.AppImage
Restart=always
RestartSec=10

[Install]
WantedBy=graphical-session.target
EOF
echo "✅ Updated systemd service configuration"

echo "📋 Step 7: Reloading systemd and enabling services..."
systemctl daemon-reload
systemctl enable getty@tty1.service
systemctl enable famsync-kiosk.service
echo "✅ Enabled autologin and kiosk services"

echo "📋 Step 8: Setting up X11 configuration..."
# Create basic X11 configuration for kiosk mode
sudo -u kiosk mkdir -p /home/kiosk/.config
cat > /home/kiosk/.config/xinitrc << 'EOF'
#!/bin/bash
# Disable screen saver and power management
xset s off
xset -dpms
xset s noblank

# Hide cursor after 1 second of inactivity
unclutter -idle 1 &

# Launch FamSync
exec /home/kiosk/FamSync.AppImage
EOF
chmod +x /home/kiosk/.config/xinitrc
chown -R kiosk:kiosk /home/kiosk/.config
echo "✅ Created X11 configuration"

echo ""
echo "🎉 Kiosk setup fix completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. If FamSync.AppImage wasn't found, build it with: npm run dist-linux"
echo "2. Copy the AppImage to /home/kiosk/FamSync.AppImage"
echo "3. Reboot the system: sudo reboot"
echo ""
echo "After reboot, the system should:"
echo "• Automatically login as 'kiosk' user"
echo "• Start the X server"
echo "• Launch FamSync in fullscreen kiosk mode"
echo ""
echo "🔍 To troubleshoot after reboot:"
echo "• Check service status: sudo systemctl status famsync-kiosk"
echo "• Check logs: sudo journalctl -u famsync-kiosk -f"
echo "• Check autologin: who"
echo ""