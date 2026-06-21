#!/bin/bash
# ProberX Agent One-Click Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash -s <DASHBOARD_URL>
# Or:     bash install.sh <DASHBOARD_URL>

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# --- Config ---
AGENT_PORT="${AGENT_PORT:-9800}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
INSTALL_DIR="/opt/proberx"
SERVICE_NAME="proberx-agent"
DASHBOARD_URL="${1:-}"

badge_ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
badge_info()  { echo -e "  ${BLUE}[..]${NC} $1"; }
badge_warn()  { echo -e "  ${YELLOW}[!!]${NC} $1"; }
badge_err()   { echo -e "  ${RED}[ERROR]${NC} $1"; }

banner() {
    echo -e "${BLUE}"
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║        ProberX Agent Installer       ║"
    echo "  ╚══════════════════════════════════════╝"
    echo -e "${NC}"
}

# --- Pre-flight checks ---
check_os() {
    badge_info "Checking OS..."
    case "$(uname -s)" in
        Linux)  OS="linux" ;;
        *)      badge_err "This installer only supports Linux. Use Docker or WSL on Windows."; exit 1 ;;
    esac

    case "$(uname -m)" in
        x86_64)  ARCH="amd64" ;;
        aarch64) ARCH="arm64" ;;
        armv7l)  ARCH="armv7" ;;
        *)       badge_err "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac
    badge_ok "OS: Linux, Arch: ${ARCH}"
}

check_deps() {
    badge_info "Checking dependencies..."
    for cmd in curl systemctl tar; do
        if ! command -v $cmd &> /dev/null; then
            badge_err "$cmd is required but not installed."
            exit 1
        fi
    done
    badge_ok "Dependencies OK"
}

prompt_dashboard_url() {
    if [ -n "$DASHBOARD_URL" ]; then
        badge_ok "DASHBOARD_URL: $DASHBOARD_URL"
        return
    fi

    echo ""
    echo -e "  ${YELLOW}Where is your ProberX Dashboard running?${NC}"
    echo "  Examples:"
    echo "    http://your-dashboard-ip:3001"
    echo "    http://dashboard.example.com"
    echo ""
    read -p "  DASHBOARD_URL: " DASHBOARD_URL

    if [ -z "$DASHBOARD_URL" ]; then
        badge_err "DASHBOARD_URL is required."
        exit 1
    fi

    # Strip trailing slash
    DASHBOARD_URL="${DASHBOARD_URL%/}"
}

# --- Install ---
install_agent() {
    badge_info "Installing agent to ${INSTALL_DIR}..."

    sudo mkdir -p "${INSTALL_DIR}/backups" "${INSTALL_DIR}/databases"

    # Detect install mode: local binary or download
    if [ -f "./agent_linux_amd64" ]; then
        badge_info "Using local agent binary..."
        sudo cp "./agent_linux_amd64" "${INSTALL_DIR}/agent"
    elif [ -f "${INSTALL_DIR}/agent" ]; then
        badge_info "Agent binary already exists in ${INSTALL_DIR}, skipping download..."
    else
        # Try to download from the dashboard server
        badge_info "Downloading agent from ${DASHBOARD_URL}/agent/download..."
        if ! curl -fsSL --connect-timeout 10 -o /tmp/proberx-agent "${DASHBOARD_URL}/agent/download"; then
            badge_warn "Dashboard doesn't serve agent binary. Checking GitHub Releases..."

            # Fallback: try GitHub Releases
            RELEASE_URL="https://github.com/longdicode/ProberX/releases/download/v1.0/proberx-agent-linux-amd64"
            if ! curl -fsSL --connect-timeout 30 -o /tmp/proberx-agent "$RELEASE_URL"; then
                badge_err "Cannot download agent binary."
                echo "  Please download the binary manually to ${INSTALL_DIR}/agent"
                echo "  Or place agent_linux_amd64 in the current directory and re-run."
                exit 1
            fi
        fi
        sudo mv /tmp/proberx-agent "${INSTALL_DIR}/agent"
    fi

    sudo chmod +x "${INSTALL_DIR}/agent"
    badge_ok "Agent binary installed"
}

create_service() {
    badge_info "Creating systemd service..."

    local env_file="${INSTALL_DIR}/.env"
    sudo tee "$env_file" > /dev/null << EOF
DASHBOARD_URL=${DASHBOARD_URL}
AGENT_PORT=${AGENT_PORT}
AGENT_TOKEN=${AGENT_TOKEN}
EOF

    sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null << EOF
[Unit]
Description=ProberX Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/agent
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proberx-agent

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${INSTALL_DIR}
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

    badge_ok "systemd service created at /etc/systemd/system/${SERVICE_NAME}.service"
}

start_service() {
    badge_info "Starting agent service..."

    sudo systemctl daemon-reload
    sudo systemctl enable "${SERVICE_NAME}"
    sudo systemctl restart "${SERVICE_NAME}"

    sleep 3

    if sudo systemctl is-active --quiet "${SERVICE_NAME}"; then
        badge_ok "Agent is running!"
    else
        badge_err "Agent failed to start. Check logs:"
        echo ""
        sudo journalctl -u "${SERVICE_NAME}" --no-pager -n 20
        exit 1
    fi
}

show_status() {
    echo ""
    echo -e "${GREEN}${BOLD}  Agent installed successfully!${NC}"
    echo ""
    echo "  ┌─────────────────────────────────────────────┐"
    echo "  │ Service:   ${SERVICE_NAME}"
    echo "  │ Dashboard: ${DASHBOARD_URL}"
    echo "  │ Port:      ${AGENT_PORT}"
    echo "  │ Install:   ${INSTALL_DIR}"
    echo "  └─────────────────────────────────────────────┘"
    echo ""
    echo "  Useful commands:"
    echo "    systemctl status ${SERVICE_NAME}"
    echo "    journalctl -u ${SERVICE_NAME} -f"
    echo "    systemctl restart ${SERVICE_NAME}"
    echo ""
    echo "  Agent ID:"
    sudo journalctl -u "${SERVICE_NAME}" --no-pager -n 20 | grep "Agent " | tail -1
    echo ""

    # Check port
    local agent_port="${AGENT_PORT:-9800}"
    if command -v ss &> /dev/null; then
        if sudo ss -tlnp | grep -q ":${agent_port}"; then
            badge_ok "Agent listening on port ${agent_port}"
        else
            badge_warn "Agent not detected on port ${agent_port}"
        fi
    fi

    echo ""
    echo -e "  ${YELLOW}Next: Add a server in your ProberX Dashboard with this machine's agent host/port.${NC}"
}

# --- Main ---
main() {
    banner
    check_os
    check_deps
    prompt_dashboard_url
    install_agent
    create_service
    start_service
    show_status
}

main
