#!/bin/bash

# Complete Kiosk Setup Script - Final Configuration
# This script configures GDM3 auto-login and finishes the kiosk setup

set -e  # Exit on any error

echo "🔧 Completing FamSync Kiosk Setup"
echo "================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

echo "📋 Step 1: Configuring GDM3 auto-login..."
# Configure GDM3 for automatic login
mkdir -p /etc/gdm3
cat > /etc/gdm3/custom.conf << 'EOF'
# GDM configuration storage
[daemon]
# Uncomment the line below to force the login screen to use Xorg
#WaylandEnable=false

# Enable automatic login for kiosk user
AutomaticLoginEnable=True
AutomaticLogin=kiosk

[security]

[xdmcp]

[chooser]

[debug]
# Uncomment the line below to turn on debugging
# More verbose logs can be found in /var/log/gdm3/
#Enable=true
EOF

echo "✅ Configured GDM3 auto-login for kiosk user"

echo "📋 Step 2: Removing getty auto-login (using graphical login instead)..."
# Remove text-mode auto-login since we're using graphical mode
if [ -d "/etc/systemd/system/getty@tty1.service.d" ]; then
    rm -rf /etc/systemd/system/getty@tty1.service.d
    echo "✅ Removed getty auto-login configuration"
else
    echo "✅ Getty auto-login was not configured"
fi

echo "📋 Step 3: Setting up kiosk user permissions..."
# Add kiosk user to necessary groups for hardware access
usermod -a -G video,audio,input,tty,dialout kiosk
echo "✅ Added kiosk user to required groups"

echo "📋 Step 4: Installing required packages..."
# Install window manager and utilities if not present
apt update -qq
apt install -y openbox unclutter xorg
echo "✅ Installed openbox, unclutter, and xorg"

echo "📋 Step 5: Creating kiosk desktop session..."
# Create a custom desktop session for the kiosk
mkdir -p /usr/share/xsessions
cat > /usr/share/xsessions/famsync-kiosk.desktop << 'EOF'
[Desktop Entry]
Name=FamSync Kiosk
Comment=FamSync Family Calendar Kiosk Mode
Exec=/home/kiosk/.xinitrc
Type=Application
EOF
echo "✅ Created FamSync kiosk desktop session"

echo "📋 Step 6: Configuring kiosk user X11 startup..."
# Create .xinitrc for kiosk user
sudo -u kiosk tee /home/kiosk/.xinitrc > /dev/null << 'EOF'
#!/bin/bash
# FamSync Kiosk X11 Startup Script

# Configure display settings for kiosk mode
xset s off          # Disable screensaver
xset -dpms          # Disable power management  
xset s noblank      # Disable screen blanking
xset r rate 300 50  # Set key repeat rate

# Hide mouse cursor when inactive (3 second delay)
unclutter -idle 3 -root &

# Start lightweight window manager
openbox-session &

# Wait for window manager to start
sleep 3

# Set wallpaper to black (clean kiosk look)
xsetroot -solid black

# Launch FamSync application in fullscreen kiosk mode
exec /home/kiosk/FamSync.AppImage --no-sandbox --disable-gpu-sandbox --disable-software-rasterizer --disable-dev-shm-usage --kiosk --start-fullscreen
EOF

# Make .xinitrc executable
chmod +x /home/kiosk/.xinitrc
chown kiosk:kiosk /home/kiosk/.xinitrc
echo "✅ Configured X11 startup for kiosk user"

echo "📋 Step 7: Creating openbox kiosk configuration..."
# Create openbox configuration for kiosk mode
sudo -u kiosk mkdir -p /home/kiosk/.config/openbox
sudo -u kiosk tee /home/kiosk/.config/openbox/rc.xml > /dev/null << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <resistance>
    <strength>10</strength>
    <screen_edge_strength>20</screen_edge_strength>
  </resistance>
  <focus>
    <focusNew>yes</focusNew>
    <followMouse>no</followMouse>
    <focusLast>yes</focusLast>
    <underMouse>no</underMouse>
    <focusDelay>200</focusDelay>
    <raiseOnFocus>no</raiseOnFocus>
  </focus>
  <placement>
    <policy>Smart</policy>
    <center>yes</center>
    <monitor>Primary</monitor>
    <primaryMonitor>1</primaryMonitor>
  </placement>
  <theme>
    <name>Clearlooks</name>
    <titleLayout>NLIMC</titleLayout>
    <keepBorder>yes</keepBorder>
    <animateIconify>yes</animateIconify>
  </theme>
  <desktops>
    <number>1</number>
    <firstdesk>1</firstdesk>
    <names>
      <name>Desktop</name>
    </names>
    <popupTime>875</popupTime>
  </desktops>
  <resize>
    <drawContents>yes</drawContents>
    <popupShow>Nonpixel</popupShow>
    <popupPosition>Center</popupPosition>
  </resize>
  <margins>
    <top>0</top>
    <bottom>0</bottom>
    <left>0</left>
    <right>0</right>
  </margins>
  <dock>
    <position>TopLeft</position>
    <floatingX>0</floatingX>
    <floatingY>0</floatingY>
    <noStrut>no</noStrut>
    <stacking>Above</stacking>
    <direction>Vertical</direction>
    <autoHide>no</autoHide>
    <hideDelay>300</hideDelay>
    <showDelay>300</showDelay>
    <moveButton>Middle</moveButton>
  </dock>
  <keyboard>
    <chainQuitKey>C-g</chainQuitKey>
    <!-- Disable most keyboard shortcuts for kiosk mode -->
  </keyboard>
  <mouse>
    <dragThreshold>1</dragThreshold>
    <doubleClickTime>200</doubleClickTime>
    <screenEdgeWarpTime>400</screenEdgeWarpTime>
    <context name="Frame">
      <mousebind button="A-Left" action="Press">
        <action name="Focus"/>
        <action name="Raise"/>
      </mousebind>
    </context>
  </mouse>
  <menu/>
  <applications>
    <!-- Force all applications to be fullscreen -->
    <application name="*">
      <maximized>true</maximized>
      <fullscreen>true</fullscreen>
    </application>
  </applications>
</openbox_config>
EOF

chown -R kiosk:kiosk /home/kiosk/.config
echo "✅ Created openbox kiosk configuration"

echo "📋 Step 8: Updating systemd service configuration..."
# Update systemd service to work with the new setup
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
Environment=XDG_RUNTIME_DIR=/run/user/1002
WorkingDirectory=/home/kiosk
ExecStartPre=/bin/sleep 15
ExecStart=/home/kiosk/FamSync.AppImage --no-sandbox --disable-gpu-sandbox --disable-software-rasterizer --disable-dev-shm-usage --kiosk --start-fullscreen
Restart=always
RestartSec=10
KillMode=mixed
TimeoutStopSec=5

[Install]
WantedBy=graphical-session.target
EOF

# Reload systemd
systemctl daemon-reload
systemctl enable famsync-kiosk.service
echo "✅ Updated and enabled FamSync systemd service"

echo "📋 Step 9: Final system configuration..."
# Disable some unnecessary services for kiosk mode
systemctl disable bluetooth.service 2>/dev/null || true
systemctl disable cups.service 2>/dev/null || true
systemctl disable ModemManager.service 2>/dev/null || true

echo "✅ Disabled unnecessary services"

echo ""
echo "🎉 Kiosk setup completed successfully!"
echo ""
echo "📋 Summary of changes:"
echo "• ✅ Configured GDM3 auto-login for 'kiosk' user"  
echo "• ✅ Removed text-mode getty auto-login"
echo "• ✅ Added kiosk user to required system groups"
echo "• ✅ Installed openbox window manager and utilities"
echo "• ✅ Created custom FamSync kiosk desktop session"
echo "• ✅ Configured X11 startup for fullscreen kiosk mode"
echo "• ✅ Set up openbox for kiosk environment"
echo "• ✅ Updated systemd service configuration"
echo "• ✅ Disabled unnecessary background services"
echo ""
echo "🔄 Next steps:"
echo "1. Reboot the system: sudo reboot"
echo ""
echo "After reboot, the system should:"
echo "• Boot directly without login screen"
echo "• Auto-login as 'kiosk' user"  
echo "• Start X11 with openbox window manager"
echo "• Launch FamSync in fullscreen kiosk mode"
echo ""
echo "🔍 If issues occur after reboot:"
echo "• Check display manager: sudo systemctl status gdm3"
echo "• Check kiosk service: sudo systemctl status famsync-kiosk"
echo "• View service logs: sudo journalctl -u famsync-kiosk -f"
echo "• Switch to another user if needed: Ctrl+Alt+F2"
echo ""