#!/usr/bin/env bash
set -e

echo "========================================="
echo "  ProberX — Self-Hosted Setup"
echo "========================================="
echo ""

# Check prerequisites
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed. Please install Docker first."
  echo "  https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "ERROR: Docker Compose is not available."
  echo "  https://docs.docker.com/compose/install/"
  exit 1
fi

echo "[OK] Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
echo "[OK] Docker Compose $(docker compose version --short)"
echo ""

# Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[INFO] Created .env from .env.example"
  echo ""
  echo "  >>> IMPORTANT: Edit .env and set your own JWT_SECRET and POSTGRES_PASSWORD <<<"
  echo ""
  read -rp "Press Enter after editing .env, or Ctrl+C to abort..."
else
  echo "[OK] .env already exists"
fi

# Pull base images
echo ""
echo "Pulling base images..."
docker compose -f docker-compose.prod.yml pull postgres redis

# Build app images
echo ""
echo "Building ProberX services..."
docker compose -f docker-compose.prod.yml build dashboard frontend

# Start
echo ""
echo "Starting ProberX..."
docker compose -f docker-compose.prod.yml up -d

# Wait for health checks
echo ""
echo "Waiting for services to be ready..."
sleep 5

# Verify
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "[OK] Dashboard API is healthy"
else
  echo "[WARN] Dashboard health check failed — check logs: docker compose -f docker-compose.prod.yml logs dashboard"
fi

echo ""
echo "========================================="
echo "  ProberX is running!"
echo ""
echo "  Dashboard:  http://localhost:3001/health"
echo "  Frontend:   http://localhost:3000"
echo ""
echo "  Manage:     docker compose -f docker-compose.prod.yml ps"
echo "  Logs:       docker compose -f docker-compose.prod.yml logs -f"
echo "  Stop:       docker compose -f docker-compose.prod.yml down"
echo "========================================="
