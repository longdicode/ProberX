#!/bin/bash
set -e

# === ProberX Agent Installer ===
# Usage:
#   curl -fsSL https://panel.yqone.cn/install-agent.sh | sudo bash -s <DASHBOARD_URL> <AGENT_TOKEN> [AGENT_ID]
#
# Example:
#   curl -fsSL https://panel.yqone.cn/install-agent.sh | sudo bash -s http://agent.yqone.cn:4000 your-agent-token agent-abc123

DASHBOARD_URL="${1:-http://127.0.0.1:4000}"
AGENT_TOKEN="${2:-}"
AGENT_ID="${3:-}"

echo "========================================="
echo "   ProberX Agent Installer"
echo "========================================="
echo "Dashboard : $DASHBOARD_URL"
echo ""

if [ -z "$AGENT_TOKEN" ]; then
    echo "ERROR: AGENT_TOKEN is required!"
    echo ""
    echo "Usage:"
    echo "  curl -fsSL https://panel.yqone.cn/install-agent.sh | sudo bash -s <DASHBOARD_URL> <AGENT_TOKEN> [AGENT_ID]"
    echo ""
    echo "Get your AGENT_TOKEN from the ProberX dashboard:"
    echo "  1. Go to Servers -> Create Server"
    echo "  2. Copy the AGENT_TOKEN shown after creation"
    echo "  3. Run this installer with the token"
    exit 1
fi

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  BIN_ARCH="amd64" ;;
    aarch64) BIN_ARCH="arm64" ;;
    *)       echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

DOWNLOAD_URL="https://panel.yqone.cn/downloads/proberx-agent-linux-${BIN_ARCH}"

echo "[1/3] Downloading agent..."
curl -fsSL "$DOWNLOAD_URL" -o /usr/local/bin/proberx-agent
chmod +x /usr/local/bin/proberx-agent
echo "       Agent installed to /usr/local/bin/proberx-agent"

echo "[2/3] Configuring systemd service..."
cat > /etc/systemd/system/proberx-agent.service << EOF
[Unit]
Description=ProberX Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/proberx-agent
Environment="DASHBOARD_URL=${DASHBOARD_URL}"
Environment="AGENT_ID=${AGENT_ID}"
Environment="AGENT_TOKEN=${AGENT_TOKEN}"
Environment="AGENT_PORT=9800"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "[3/3] Starting agent..."
systemctl daemon-reload
systemctl enable proberx-agent
systemctl start proberx-agent

sleep 2
if systemctl is-active --quiet proberx-agent; then
    echo ""
    echo "========================================="
    echo "   Agent installed successfully!"
    echo "========================================="
    echo ""
    echo "Useful commands:"
    echo "  systemctl status proberx-agent"
    echo "  journalctl -u proberx-agent -f"
    echo ""
    if [ -n "$AGENT_ID" ]; then
        echo "Agent ID: $AGENT_ID"
    fi
else
    echo ""
    echo "ERROR: Agent failed to start."
    echo "Check logs: journalctl -u proberx-agent -n 30"
    exit 1
fi