#!/bin/bash

# Wait for X server to be available
echo "Waiting for X server..."
while ! xset q &>/dev/null; do
    sleep 1
done

echo "X server is ready, starting FamSync..."

# Set up display environment
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/$(id -u)

# Disable screen saver and power management
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

# Launch FamSync with all necessary flags
exec /home/kiosk/FamSync.AppImage --no-sandbox --disable-gpu-sandbox --disable-software-rasterizer --disable-dev-shm-usage
EOF

sudo chmod +x /home/kiosk/start-famsync.sh
sudo chown kiosk:kiosk /home/kiosk/start-famsync.sh