#!/bin/bash
# ProberX SSH Tunnel Manager
# Maintains persistent tunnels between local machine and remote server

REMOTE_HOST="${1:-82.156.14.93}"
REMOTE_USER="${2:-ubuntu}"
LOCAL_DASHBOARD_PORT="${3:-3001}"
REMOTE_AGENT_PORT="${4:-9800}"
LOCAL_FORWARD_PORT="${5:-19800}"

SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "[$(date '+%H:%M:%S')] $1"; }

cleanup() {
    log "${YELLOW}Shutting down tunnels...${NC}"
    kill $TUNNEL_REVERSE_PID 2>/dev/null
    kill $TUNNEL_FORWARD_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

start_reverse_tunnel() {
    while true; do
        log "Starting reverse tunnel: remote:${LOCAL_DASHBOARD_PORT} -> local:${LOCAL_DASHBOARD_PORT}"
        ssh ${SSH_OPTS} -N -R ${LOCAL_DASHBOARD_PORT}:localhost:${LOCAL_DASHBOARD_PORT} ${REMOTE_USER}@${REMOTE_HOST} 2>&1
        log "${RED}Reverse tunnel disconnected, reconnecting in 5s...${NC}"
        sleep 5
    done
}

start_forward_tunnel() {
    while true; do
        log "Starting forward tunnel: local:${LOCAL_FORWARD_PORT} -> remote:${REMOTE_AGENT_PORT}"
        ssh ${SSH_OPTS} -N -L ${LOCAL_FORWARD_PORT}:127.0.0.1:${REMOTE_AGENT_PORT} ${REMOTE_USER}@${REMOTE_HOST} 2>&1
        log "${RED}Forward tunnel disconnected, reconnecting in 5s...${NC}"
        sleep 5
    done
}

# Kill any existing port bindings on remote
ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} \
    "sudo pkill -f 'sshd:.*:${LOCAL_DASHBOARD_PORT}' 2>/dev/null; echo ok" > /dev/null 2>&1

# Start both tunnels in background
start_reverse_tunnel &
TUNNEL_REVERSE_PID=$!

start_forward_tunnel &
TUNNEL_FORWARD_PID=$!

log "${GREEN}Both tunnels started (PIDs: reverse=$TUNNEL_REVERSE_PID, forward=$TUNNEL_FORWARD_PID)${NC}"
log "  Reverse: remote:${LOCAL_DASHBOARD_PORT}  ->  localhost:${LOCAL_DASHBOARD_PORT}"
log "  Forward: localhost:${LOCAL_FORWARD_PORT}  ->  remote:${REMOTE_AGENT_PORT}"
log "${YELLOW}Press Ctrl+C to stop${NC}"

# Wait for both
wait $TUNNEL_REVERSE_PID $TUNNEL_FORWARD_PID
