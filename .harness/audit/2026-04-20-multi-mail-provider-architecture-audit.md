# 2026-04-20 Multi Mail Provider Architecture Audit

- Task type: Code
- Timestamp: 2026-04-20T21:23:17+08:00
- Scope: added multi-provider mail onboarding and runtime support for Gmail, iCloud Mail, NetEase 163, QQ Mail, Aliyun Mail, and custom IMAP while keeping Outlook on Microsoft Graph.

## Files Reviewed

- `packages/shared-types/src/index.ts`
- `apps/bff/package.json`
- `apps/bff/prisma/schema.prisma`
- `apps/bff/prisma/migrations/202604201445_multi_mail_imap_credentials/migration.sql`
- `apps/bff/src/mail-provider-registry.ts`
- `apps/bff/src/imap-credential-store.ts`
- `apps/bff/src/imap-mail.ts`
- `apps/bff/src/mail-source-service.ts`
- `apps/bff/src/mail.ts`
- `apps/bff/src/server.ts`
- `apps/bff/src/routes/mail.ts`
- `apps/bff/src/types/mail-session.ts`
- `apps/webui/src/types/index.ts`
- `apps/webui/src/contexts/MailContext.tsx`
- `apps/webui/src/components/dashboard/SettingsView.tsx`
- `apps/webui/src/components/dashboard/MailDetailModal.tsx`
- `apps/webui/src/components/dashboard/MailDetailPage.tsx`
- `apps/webui/src/components/layout/Sidebar.tsx`
- `deploy/docs/MULTI_MAIL_PROVIDERS.md`

## Independent Audit

- Reviewer: sub-agent `Locke` (`019dab0a-981a-7ae2-b06d-ef0f995f3042`)

### Round 1 of 3

- Result: 2 High, 2 Medium

Reviewer summary:

```text
- High: Mail body cache was keyed only by messageId, so IMAP uid collisions across sources could leak one mailbox's body into another.
- High: IMAP onboarding allowed imapSecure=false, exposing credentials to plaintext IMAP.
- Medium: MailSourceCredential ownership was not enforced by a composite DB relation.
- Medium: IMAP inbox list still fetches/parses message source for list-style reads, which is heavier than needed.
```

Fixes applied after Round 1:

- Scoped mail-body cache entries by `sourceId + messageId`, cleared cache on source switch, and forced detail fetches to carry explicit `sourceId`.
- Removed the insecure IMAP TLS toggle from the WebUI and made the BFF reject plaintext IMAP with `IMAP_TLS_REQUIRED`.
- Bound `MailSourceCredential (sourceId,userId)` back to `MailSource (id,userId)` in Prisma schema and migration.
- Added source-deletion cleanup for stored IMAP credentials and capped the IMAP detail read path.

### Round 2 of 3

- Result: clean for Critical/High; 1 Medium deferred

Reviewer summary:

```text
- Previous High #1 fixed: Yes. MailContext/MailDetail cache is now source-scoped and detail fetches are source-bound.
- Previous High #2 fixed: Yes. server.ts rejects plaintext IMAP and SettingsView no longer exposes the insecure toggle.
- Remaining Critical/High findings: None.
- Important Medium: IMAP inbox listing still fetches/parses message source for list/triage/insight reads, so large mailboxes may still be slower than ideal.
```

## Validation

- `npm --workspace packages/shared-types run typecheck`: PASS
- `npm --workspace apps/bff run check`: PASS
- `npm --workspace apps/webui run check`: PASS
- `DATABASE_URL=postgresql://user:pass@localhost:5432/mail_agent npx prisma validate --schema apps/bff/prisma/schema.prisma`: PASS
- `npm --workspace apps/bff run build`: PASS
- `npm --workspace apps/webui run build`: PASS
- `curl -s http://127.0.0.1:8787/health`: PASS
- authenticated `GET http://127.0.0.1:8787/api/mail/providers`: PASS
- authenticated `POST http://127.0.0.1:8787/api/mail/connections/imap` with `imapSecure=false`: PASS, rejected with `IMAP_TLS_REQUIRED`
- `git diff --check` over touched files: PASS
- `npm run check:standard`: FAIL in pre-existing WebUI Playwright smoke paths that still assume older navigation/content contracts outside this slice

## Deferred Medium

- `apps/bff/src/imap-mail.ts:174`
- Issue: list/triage/insight IMAP reads still fetch and parse message source for each listed message.
- Rationale: performance optimization, not a correctness or credential-isolation blocker for this rollout.
- Owner: Codex / fairchan workspace
- Target date: 2026-04-23

## Final Status

No unresolved Critical or High findings remain. Multi-provider onboarding, credential storage, provider discovery, and source-aware message retrieval are ready for local testing. One Medium IMAP list-performance improvement is intentionally deferred with owner and target date recorded above.
