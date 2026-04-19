# Production Deployment

There are two supported production paths in this repository:

1. Host-based deployment using the previously established stack:
   `Nginx -> static WebUI under /var/www -> systemd BFF on 127.0.0.1:8787`
2. Single-node Docker Compose deployment for WebUI, BFF, Postgres, and Redis.

The host-based path is the closest match to the historical `true-sight.asia` setup. The Docker path remains useful when the whole stack should live inside containers.

## Host Deployment

### Requirements

- Node.js 20+
- `npm`, `rsync`, `curl`, `systemctl`, and `nginx`
- A prepared `apps/bff/.env` with production values
- A public HTTPS origin for the WebUI

### Install service and Nginx templates

Use the examples in `deploy/host/` as the starting point:

- `openclaw-mail-bff.service.example`
- `nginx-mail-agent.conf.example`

Typical flow on the server:

```bash
sudo useradd --system --home-dir /var/lib/mail-agent-bff --shell /usr/sbin/nologin mail-agent || true
sudo install -d -o mail-agent -g mail-agent /opt/mail-agent-bff /opt/mail-agent-bff/apps/bff/data /etc/mail-agent-bff
sudo cp deploy/host/openclaw-mail-bff.service.example /etc/systemd/system/openclaw-mail-bff.service
sudo cp deploy/host/nginx-mail-agent.conf.example /etc/nginx/sites-available/mail-agent
sudo ln -sf /etc/nginx/sites-available/mail-agent /etc/nginx/sites-enabled/mail-agent
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl enable openclaw-mail-bff.service
sudo systemctl reload nginx
```

Edit the copied files for the real workspace path, domain, service user, env file, and web root before enabling them.

### Deploy from the repository root

```bash
PUBLIC_WEB_DIR=/var/www/true-sight.asia \
SYSTEMD_SERVICE_NAME=openclaw-mail-bff.service \
PUBLIC_HEALTHCHECK_URL=https://true-sight.asia/api/ready \
./deploy.sh
```

Optional environment variables for `./deploy.sh` / `deploy/host/deploy.sh`:

- `WORKSPACE_DIR`: override the repository location on the server.
- `BFF_HEALTHCHECK_URL`: defaults to `http://127.0.0.1:8787/api/ready`.
- `PUBLIC_HEALTHCHECK_URL`: public smoke-check URL after deploy.
- `RUN_NPM_CI=false`: skip `npm ci` when dependencies are already current.
- `RUN_PRISMA_MIGRATE=false`: skip `prisma migrate deploy` only for a deliberate no-schema-change emergency redeploy.
- `RELOAD_NGINX=true`: validate and reload Nginx during deploy.
- `WAIT_SECONDS`: readiness wait timeout, default `90`.

### GitHub Actions host deploy

`.github/workflows/deploy.yml` now pushes repository files to a remote host, then invokes `./deploy.sh` there. Configure these GitHub environment secrets and variables per target environment:

- Secret `SSH_PRIVATE_KEY`
- Secret `SSH_HOST`
- Secret `SSH_USER`
- Secret `SSH_KNOWN_HOSTS`
- Variable `DEPLOY_WORKSPACE_DIR`
- Variable `DEPLOY_PUBLIC_DIR`
- Variable `DEPLOY_SERVICE_NAME`
- Optional variable `DEPLOY_BFF_READY_URL`
- Optional variable `DEPLOY_PUBLIC_HEALTHCHECK_URL`
- Optional variable `DEPLOY_RELOAD_NGINX`

The workflow uses the selected GitHub Environment so staging and production can keep different host values without editing the workflow file.
Manual production dispatches only run from `main` or `v*` release tags. The remote sync first creates a deploy artifact from git-tracked runtime/build inputs, including repo skills and Prisma migrations, then preserves remote `.env` and data directories while syncing that artifact to the server. The artifact step fails early if the host deploy helper, Prisma schema/migrations, or skills directory are missing.

## Single-Node Docker Deployment

This production path runs WebUI, BFF, Postgres, and Redis on one host with Docker Compose. WebUI is served by Nginx and proxies same-origin `/api/*` traffic, including SSE and Microsoft OAuth callbacks, to the BFF. The BFF host port is bound to `127.0.0.1` for local readiness checks only; do not expose it directly to the internet.

## Requirements

- Docker 24+ with Docker Compose v2.
- A public HTTPS origin for `PUBLIC_BASE_URL`.
- Azure app registration for Microsoft Direct OAuth / Microsoft Graph.
- An OpenAI-compatible LLM provider key.

## Configure

```bash
cd deploy/docker
cp .env.example .env
```

Fill every required value in `.env`:

- `PUBLIC_BASE_URL`: external WebUI origin, for example `https://mail.example.com`.
- `DB_PASSWORD`: strong Postgres password.
- `BFF_API_KEY`: at least 16 random characters.
- `APP_ENCRYPTION_KEY`: strong random key used to encrypt Microsoft tokens and stored provider keys.
- `LLM_PROVIDER_BASE_URL`, `LLM_PROVIDER_API_KEY`, `LLM_PROVIDER_MODEL`: server-side LLM route.
- `MICROSOFT_CLIENT_ID`: Azure app client id.
- `MICROSOFT_REDIRECT_URI`: optional. If omitted, BFF derives `${PUBLIC_BASE_URL}/api/mail/connections/outlook/direct/callback`.

Do not commit a real `.env` file.

## Start

```bash
cd deploy/docker
./deploy.sh
```

The BFF image runs `prisma migrate deploy` before `node apps/bff/dist/server.js`. If migrations fail, the BFF container does not start.

Manual equivalent:

```bash
cd deploy/docker
docker compose build
docker compose up -d
docker compose logs -f bff
```

## Verify

```bash
curl http://127.0.0.1:8787/api/live
curl http://127.0.0.1:8787/api/ready
curl http://127.0.0.1:8080/health
```

Expected readiness dependencies:

- Postgres/Prisma reachable.
- Server-side LLM route configured.
- Microsoft Direct OAuth configured.
- Redis session store reachable when enabled.

## Operational Notes

- OpenClaw is not required for the production Mastra runtime.
- Microsoft Direct is the v1 supported mail connection path.
- Composio remains legacy/advanced and must pass server-side trust checks before a source can execute mail, Agent, or KB calls.
- Knowledge-base jobs are in-process and locked by `userId + sourceId`; use one BFF replica for this deployment mode.

## Backup

```bash
cd deploy/docker
docker compose exec postgres pg_dump -U mery -d mery > backup-$(date +%Y%m%d-%H%M%S).sql
```

Redis only stores session state in this deployment. Back up Postgres before migrations, upgrades, or key rotation.

## Rollback

```bash
cd deploy/docker
docker compose down
git checkout <previous-known-good-commit>
docker compose build
docker compose up -d
```

If a migration has already run, restore the Postgres backup that matches the previous app version.

## Key Rotation

- Rotate `LLM_PROVIDER_API_KEY` at the provider, then update `.env` and restart `bff`.
- Rotating `APP_ENCRYPTION_KEY` requires re-encrypting stored Microsoft/provider secrets or reconnecting affected accounts.
- Rotate `DB_PASSWORD` by updating Postgres credentials and `DATABASE_URL` together during a maintenance window.
