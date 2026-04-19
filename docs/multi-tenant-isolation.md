# Multi-Tenant Isolation Notes

This project currently uses a personal-tenant model: each authenticated user owns a deterministic personal tenant, and each mailbox source is scoped under that user. The runtime tenant id is derived from `User.id` and is intentionally not the same as Microsoft Entra `tenantId`.

## Implemented Guard Rails

- Every active mailbox, knowledge-base, agent memory, Microsoft direct account, and Outlook sync path is resolved by `userId` and usually `sourceId`.
- The BFF now builds a first-class `tenantId` for every `TenantContext`.
- API rate-limit keys no longer use raw session token prefixes; they key by tenant where possible and by a hashed session fallback otherwise.
- Redis session keys now store only SHA-256 hashes of session tokens. Legacy raw-token Redis keys are read once for compatibility and removed on the next save/logout.
- Knowledge-base artifact APIs and agent tools return public `mail-kb://documents/...` paths instead of absolute local filesystem paths.
- A file-backed tenant audit log records important writes under `apps/bff/data/audit-log/<hashed-tenant>/<month>.jsonl`.
- `/api/security/audit-log` returns only the current user's own tenant audit entries.
- The dormant global `mail-kb-service.ts` singleton is disabled by default so future code cannot accidentally revive flat shared storage.
- The Prisma migration `202604191830_multi_tenant_isolation_hardening` adds an `AuditLog` table and composite source-owner guards.

## Enterprise Direction

The strongest production path remains shared database/shared schema with explicit tenant columns and database enforcement:

- Add organization/workspace tenants when one account can contain multiple users.
- Keep authentication identity and active organization context separate.
- Use PostgreSQL Row-Level Security with transaction-local settings such as `mery.user_id` and `mery.tenant_id`.
- Use a non-owner database role in production; table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is enabled.
- Do not enable RLS until request-scoped Prisma transactions set `mery.user_id` and `mery.tenant_id` for every query path.
- Add Redis-backed rate limits by `tenantId:userId:route` and by `tenantId:sourceId:provider` for expensive mail and LLM flows.
- Move provider tokens from one app-wide encryption key to KMS/Vault/OpenBao Transit-style envelope encryption with per-tenant context and key versions.
- Model enterprise SSO and delegated roles with OIDC/SAML and RBAC/ABAC before selling to organizations.

## References Checked

- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL CREATE POLICY: https://www.postgresql.org/docs/current/sql-createpolicy.html
- Prisma transactions and raw SQL docs for request-scoped DB context
- OpenFGA organization-context authorization and modeling principles
- ZITADEL B2B multi-tenant auth and organization/project models
- OWASP Logging, Secrets Management, and Key Management cheat sheets
- pgAudit project documentation
- `@fastify/rate-limit` and Fastify `trustProxy` guidance
