# Active Multi-Tenant Isolation Hardening Audit

- Task type: Code
- Timestamp: 2026-04-19T19:11:49+08:00
- Auditor: Codex sub-agent `Galileo` (`gpt-5.4-mini`, high reasoning)
- Scope: `apps/bff/src/tenant-isolation.ts`, `apps/bff/src/server.ts`, `apps/bff/src/redis-session-store.ts`, agent runtime tenant context files, KB export/path files, Prisma schema/migration, multi-tenant docs, and `apps/webui/src/components/layout/AppDock.tsx`

## Round 1

Result: one High, one Low.

- High: migration enabled RLS policies that depended on `current_setting('mery.user_id', true)` without runtime `set_config` / `SET LOCAL` wiring. This could be a no-op for owner roles or a deployment breaker for non-owner roles.
- Low: legacy global KB could still be revived through `LEGACY_GLOBAL_MAIL_KB_ENABLED`.

Actions taken:

- Removed the RLS enable/policy block from `apps/bff/prisma/migrations/202604191830_multi_tenant_isolation_hardening/migration.sql`.
- Updated `docs/multi-tenant-isolation.md` to state RLS is deferred until every Prisma transaction gets request-local tenant context.
- Removed the legacy global KB env escape hatch; `createLegacyMailKnowledgeBaseForMigration()` now always throws.

## Round 2

Result: clean.

Sub-agent output summary:

- `migration.sql` now only documents that RLS is deferred; no `ENABLE ROW LEVEL SECURITY`, no policies, and no `current_setting('mery.user_id')` wiring.
- `docs/multi-tenant-isolation.md` matches runtime reality.
- `mail-kb-service.ts` hard-throws for the legacy singleton, with no active repo usage of that escape hatch.
- No remaining Critical, High, Medium, or Low findings in reviewed area.

## Validation

- `npm --workspace apps/bff run check`: PASS
- `npm --workspace apps/webui run check`: PASS
- `npm --workspace apps/webui run build`: PASS
- `npm --workspace apps/bff run build`: PASS
- `DATABASE_URL=postgresql://user:pass@localhost:5432/mail_agent npx prisma validate --schema apps/bff/prisma/schema.prisma`: PASS
- `npm run harness:semantic`: PASS with 11 pre-existing safeParse warnings
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 -g "migrated dock|dock tooltips"`: PASS, 2 passed
- `npm run check:standard`: PASS, 26 e2e tests passed
- `git diff --check`: PASS
