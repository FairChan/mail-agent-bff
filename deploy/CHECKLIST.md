# Production Readiness Checklist

## Before Deploy

- [ ] `deploy/docker/.env` exists and contains no placeholder values.
- [ ] `PUBLIC_BASE_URL` is the final HTTPS origin.
- [ ] Azure app redirect URI includes `/api/mail/connections/outlook/direct/callback`.
- [ ] `APP_ENCRYPTION_KEY`, `BFF_API_KEY`, `DB_PASSWORD`, and LLM key are generated secrets.
- [ ] `docker compose config` succeeds from `deploy/docker`.
- [ ] `npm run check` and `npm run build` pass locally or in CI.
- [ ] Prisma schema validates with `DATABASE_URL` set.

## Deploy

- [ ] `docker compose build` completes.
- [ ] BFF container logs show `prisma migrate deploy` completed.
- [ ] `GET /api/live` returns 200.
- [ ] `GET /api/ready` returns 200.
- [ ] WebUI loads through Nginx on the public origin.

## Functional Smoke

- [ ] Register and log in as user A.
- [ ] Register and log in as user B in another browser profile.
- [ ] Connect Microsoft Direct for both users.
- [ ] User A cannot read user B `sourceId`, `messageId`, `jobId`, or Microsoft account id.
- [ ] Mail list, mail detail, triage, insights, Agent chat, calendar sync, and KB trigger work for each user.
- [ ] KB job stream emits progress and final/error.
- [ ] Agent timeout/tool errors exit the UI busy state.

## Privacy and Logs

- [ ] Logs do not contain provider keys, Microsoft tokens, full prompts, or full mail bodies.
- [ ] Historical Composio sources are disabled or untrusted after migration.
- [ ] Manual Composio source creation is not exposed as the normal user path.
- [ ] KB export contains DTOs only, not raw database rows.

## Backup and Rollback

- [ ] Postgres backup taken before deploy.
- [ ] Rollback commit/image is known.
- [ ] Restore command has been tested on a staging copy.
- [ ] Key rotation procedure is documented for the operator.
