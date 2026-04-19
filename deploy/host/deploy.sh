#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WORKSPACE_DIR="${WORKSPACE_DIR:-$ROOT_DIR}"
PUBLIC_WEB_DIR="${PUBLIC_WEB_DIR:-}"
SYSTEMD_SERVICE_NAME="${SYSTEMD_SERVICE_NAME:-openclaw-mail-bff.service}"
BFF_HEALTHCHECK_URL="${BFF_HEALTHCHECK_URL:-http://127.0.0.1:8787/api/ready}"
PUBLIC_HEALTHCHECK_URL="${PUBLIC_HEALTHCHECK_URL:-}"
RUN_NPM_CI="${RUN_NPM_CI:-true}"
RUN_PRISMA_MIGRATE="${RUN_PRISMA_MIGRATE:-true}"
RELOAD_NGINX="${RELOAD_NGINX:-false}"
WAIT_SECONDS="${WAIT_SECONDS:-90}"

if [ -z "$PUBLIC_WEB_DIR" ]; then
  echo "PUBLIC_WEB_DIR is required, for example /var/www/true-sight.asia"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required."
  exit 1
fi

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "This step requires root privileges or sudo: $*"
  exit 1
}

echo "== Host Deploy =="
echo "Workspace: $WORKSPACE_DIR"
echo "Public Web Dir: $PUBLIC_WEB_DIR"
echo "Systemd Service: $SYSTEMD_SERVICE_NAME"

cd "$WORKSPACE_DIR"

if [ "$RUN_NPM_CI" = "true" ]; then
  echo "-- npm ci"
  npm ci
else
  echo "-- skipping npm ci (RUN_NPM_CI=$RUN_NPM_CI)"
fi

echo "-- build bff"
npm --workspace apps/bff run build

echo "-- build webui"
npm --workspace apps/webui run build

if [ "$RUN_PRISMA_MIGRATE" = "true" ]; then
  echo "-- prisma migrate deploy"
  (
    cd apps/bff
    npx prisma migrate deploy --schema prisma/schema.prisma
  )
else
  echo "-- skipping prisma migrate deploy (RUN_PRISMA_MIGRATE=$RUN_PRISMA_MIGRATE)"
fi

echo "-- sync webui dist"
run_privileged install -d "$PUBLIC_WEB_DIR"
run_privileged rsync -a --delete apps/webui/dist/ "$PUBLIC_WEB_DIR/"

if [ "$RELOAD_NGINX" = "true" ]; then
  echo "-- validate and reload nginx"
  run_privileged nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    run_privileged systemctl reload nginx
  else
    run_privileged nginx -s reload
  fi
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is required for host deployment."
  exit 1
fi

echo "-- restart bff service"
run_privileged systemctl restart "$SYSTEMD_SERVICE_NAME"
run_privileged systemctl is-active --quiet "$SYSTEMD_SERVICE_NAME"

echo "-- wait for bff readiness"
deadline=$((SECONDS + WAIT_SECONDS))
until curl -fsS "$BFF_HEALTHCHECK_URL" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "BFF did not become ready: $BFF_HEALTHCHECK_URL"
    run_privileged systemctl status "$SYSTEMD_SERVICE_NAME" --no-pager || true
    exit 1
  fi
  sleep 2
done

if [ -n "$PUBLIC_HEALTHCHECK_URL" ]; then
  echo "-- check public health"
  curl -fsS "$PUBLIC_HEALTHCHECK_URL" >/dev/null
fi

echo "Deployment finished."
echo "BFF ready: $BFF_HEALTHCHECK_URL"
if [ -n "$PUBLIC_HEALTHCHECK_URL" ]; then
  echo "Public health: $PUBLIC_HEALTHCHECK_URL"
fi
