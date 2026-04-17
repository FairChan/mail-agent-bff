# 2026-04-17 Outlook Memory Fallback Audit

- Timestamp: 2026-04-17T13:52:14+08:00
- Auditor: Hooke (`019d99f9-e8e2-7842-b376-2fdf721c83e4`)
- Tool/model: Codex sub-agent, `gpt-5.4-mini`, explorer role
- Scope: Review the fix for Outlook direct auth failing with `MAIL_SOURCE_STORE_UNAVAILABLE` when local Prisma is disabled.

## Initial Findings

- Critical: none
- High: Prisma-disabled mail source fallback was initially automatic and could silently turn storage into per-process RAM if an environment forgot to enable Prisma.
- Medium: none
- Low: Empty per-user in-memory source stores were not reclaimed after deleting the final source.

## Fixes Applied After Initial Audit

- Added explicit `MAIL_SOURCE_MEMORY_FALLBACK_ENABLED`, defaulting to `false`.
- Limited mail-source and Microsoft-account in-memory fallback to environments that explicitly enable the flag.
- Kept local ignored `apps/bff/.env` enabled for this machine so local Outlook auth can work without Prisma.
- Added empty in-memory source store pruning after fallback deletes.

## Recheck Findings

- Critical: none
- High: none
- Medium: none
- Low: none

## Residual Risk

- `MAIL_SOURCE_MEMORY_FALLBACK_ENABLED=true` is an explicit local/dev mode. State is process-local and disappears on restart, so it must not be used as production persistence.
- With fallback disabled and Prisma unavailable, Outlook direct auth intentionally fails closed with store-unavailable errors.

## Validation Evidence

- `npm --workspace apps/bff run check`: passed
- `npm --workspace apps/bff run build`: passed
- `git diff --check`: passed
- `npm run harness:semantic`: passed with existing warnings
- `npm run harness:smoke`: passed with 3/3 tests
- Local BFF restarted from `dist/server.js`
- Local admin login succeeded
- `GET /api/mail/connections/outlook/direct/start?...` returned `302` to `login.microsoftonline.com`
- Service-level fallback disabled check returned `MAIL_SOURCE_STORE_UNAVAILABLE`
- Service-level fallback enabled check created a `microsoft` mail source with an active source id
