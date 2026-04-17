# Mail Agent Web Stack

This repository is a monorepo for a privacy-isolated mail assistant:

`WebUI -> Nginx /api proxy -> BFF -> Mastra Agent / LLM Gateway / Microsoft Graph / Prisma`.

OpenClaw is retained only as a legacy fallback. The default production runtime is Mastra, and the v1 supported mail connection path is Microsoft Direct OAuth + Microsoft Graph.

## Structure

- `apps/bff`: Fastify BFF, Prisma, Mastra runtime, Microsoft Graph integration, tenant guards, LLM gateway, and KB worker.
- `apps/webui`: React + Vite browser UI.
- `packages/shared-types`: shared TypeScript schemas and types.
- `deploy/docker`: single-node Docker Compose deployment for WebUI, BFF, Postgres, and Redis.
- `deploy/docs/DEPLOYMENT.md`: production runbook.
- `deploy/CHECKLIST.md`: operator checklist.

## Core Guarantees

- Browser requests never include provider API keys, Microsoft tokens, or Composio credentials.
- Every mail source, KB row, Agent memory row, LLM usage row, and KB job is scoped by `userId + sourceId`.
- `default_outlook` is not an executable production source.
- Microsoft Direct sources are trusted only after owned OAuth account persistence.
- Composio sources are legacy/advanced and must be server-trusted before they can execute mail, Agent, or KB calls.

## Main Interfaces

- `GET /api/live`: process liveness.
- `GET /api/ready`: readiness for Prisma/Postgres, LLM route, Microsoft config, and Redis session store.
- `GET /api/health`: readiness-compatible health summary.
- `GET /api/mail/sources`: current user's owned sources and active source id.
- `POST /api/mail/connections/outlook/direct/start`: start Microsoft Direct OAuth.
- `GET /api/mail/connections/outlook/direct/callback`: Microsoft OAuth callback.
- `GET /api/mail/triage`: mailbox triage for the current tenant/source.
- `GET /api/mail/insights`: DDL/meeting/event extraction for the current tenant/source.
- `POST /api/mail/calendar/sync`: sync one extracted insight to Outlook Calendar.
- `POST /api/agent/chat`: SSE Mastra agent chat.
- `POST /api/agent/query`: compatibility wrapper over Mastra.
- `GET /api/agent/memory/recent`: tenant-scoped Agent memory.
- `POST /api/agent/memory`: write tenant-scoped Agent memory.
- `POST /api/mail/knowledge-base/trigger`: create a tenant-scoped KB job.
- `GET /api/mail/knowledge-base/jobs/:jobId`: read owned KB job status.
- `GET /api/mail/knowledge-base/jobs/:jobId/stream`: SSE progress for an owned KB job.
- `GET /api/mail-kb/stats`, `/mails`, `/events`, `/persons`, `/export`: DB-backed KB views for the current tenant/source.

## Local Development

```bash
npm ci
cp apps/bff/.env.example apps/bff/.env
cp apps/webui/.env.example apps/webui/.env
```

Fill `apps/bff/.env` with local Postgres, `BFF_API_KEY`, `APP_ENCRYPTION_KEY`, LLM provider config, and Microsoft OAuth config.

```bash
npm run dev:bff
npm run dev:web
```

Useful checks:

```bash
npm --workspace apps/bff run check
npm --workspace apps/webui run check
DATABASE_URL=postgresql://user:pass@localhost:5432/mail_agent_validate npx prisma validate --schema apps/bff/prisma/schema.prisma
```

On Windows PowerShell, use `npm.cmd`/`npx.cmd` if script execution policy blocks `.ps1` shims.

## Production Docker

```bash
cd deploy/docker
cp .env.example .env
# edit .env
./deploy.sh
```

The BFF container runs `prisma migrate deploy` before startup. If migrations fail, the BFF does not start. Nginx serves WebUI and proxies `/api/*` to BFF on the internal Docker network.

See [deploy/docs/DEPLOYMENT.md](deploy/docs/DEPLOYMENT.md) for the full runbook.

## Verification

```bash
npm run check
npm run build
npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts
```

Production smoke checks:

- Register/login as two users.
- Connect Microsoft Direct for both.
- Verify each user can only access their own `sourceId`, `messageId`, `jobId`, memory, KB, and Microsoft account.
- Run triage, insights, mail detail, Agent chat, KB trigger/stream, and calendar sync.
- Confirm logs do not contain provider keys, Microsoft tokens, full prompts, or full mail bodies.
