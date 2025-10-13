sudo tee /etc/systemd/system/famsync-kiosk.service > /dev/null << 'EOF'
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
ExecStartPre=/bin/sleep 10
ExecStart=/home/kiosk/FamSync.AppImage --no-sandbox --disable-gpu-sandbox --disable-software-rasterizer
Restart=always
RestartSec=10
KillMode=mixed
TimeoutStopSec=5

[Install]
WantedBy=graphical-session.target
EOF