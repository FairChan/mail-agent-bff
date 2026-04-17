#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created deploy/docker/.env from .env.example."
  echo "Edit deploy/docker/.env with production secrets before running again."
  exit 1
fi

BFF_PORT_VALUE="${BFF_PORT:-$(grep -E '^BFF_PORT=' .env | tail -n 1 | cut -d= -f2- || true)}"
WEBUI_PORT_VALUE="${WEBUI_PORT:-$(grep -E '^WEBUI_PORT=' .env | tail -n 1 | cut -d= -f2- || true)}"
BFF_PORT_VALUE="${BFF_PORT_VALUE:-8787}"
WEBUI_PORT_VALUE="${WEBUI_PORT_VALUE:-8080}"

docker compose build
docker compose up -d

echo "Waiting for readiness..."
for i in {1..60}; do
  if curl -fsS "http://127.0.0.1:${BFF_PORT_VALUE}/api/ready" >/dev/null 2>&1; then
    docker compose ps
    echo "Deployment is ready."
    echo "WebUI: http://127.0.0.1:${WEBUI_PORT_VALUE}"
    echo "BFF readiness: http://127.0.0.1:${BFF_PORT_VALUE}/api/ready"
    exit 0
  fi
  sleep 2
done

docker compose ps
docker compose logs --tail=120 bff
echo "BFF did not become ready in time."
exit 1
