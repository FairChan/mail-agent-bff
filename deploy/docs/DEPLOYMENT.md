# Single-Node Docker Deployment

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
