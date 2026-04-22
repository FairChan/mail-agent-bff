# 2026-04-20 Gmail Direct OAuth Audit

- Task type: Code
- Timestamp: 2026-04-20T23:57:01+08:00
- Scope: completed the Gmail direct OAuth path on top of the multi-mail architecture, including BFF routes, Gmail API mail reads, WebUI connect entry points, token persistence, and local runtime validation.

## Files Reviewed

- `apps/bff/src/config.ts`
- `apps/bff/src/google-gmail.ts`
- `apps/bff/src/mail-provider-registry.ts`
- `apps/bff/src/mail-source-service.ts`
- `apps/bff/src/mail.ts`
- `apps/bff/src/server.ts`
- `apps/bff/prisma/schema.prisma`
- `apps/bff/prisma/migrations/202604201930_google_accounts/migration.sql`
- `apps/bff/.env.example`
- `apps/webui/src/contexts/MailContext.tsx`
- `apps/webui/src/components/dashboard/SettingsView.tsx`
- `apps/webui/src/components/layout/Sidebar.tsx`
- `deploy/docs/MULTI_MAIL_PROVIDERS.md`

## Independent Audit

- Reviewer: sub-agent `Lovelace` (`019dab8f-2886-7661-8140-2791a0bcbead`)
- Tool/model: `spawn_agent` explorer sub-agent, inherited session model

### Round 1 of 3

- Result: no Critical or High; 2 Medium, 2 Low

Reviewer summary:

```text
- Medium: Gmail direct start could still late-fail at callback because APP_ENCRYPTION_KEY / token-store readiness was not checked before redirecting to Google.
- Medium: Gmail in-memory token cache was not cleared on logout/session expiry.
- Low: provider catalog still claimed unsupported gmail imap_oauth2.
- Low: some Gmail popup failure branches could miss attemptId, while the frontend required a strict attemptId match.
```

Fixes applied after Round 1:

- Added Gmail start-route readiness checks for `APP_ENCRYPTION_KEY` and account-store availability before redirecting to Google.
- Added `clearGoogleDirectAuthSessionState()` and wired it into `clearSessionState()` so Gmail token/session state is cleared on logout or expiry.
- Removed unsupported `imap_oauth2` from the Gmail provider catalog.
- Relaxed Gmail popup message matching so missing `attemptId` no longer drops genuine failure payloads.

### Round 2 of 3

- Result: no Critical / High / Medium; 1 Low

Reviewer summary:

```text
- Previous Medium findings are fixed.
- Previous provider-catalog Low is fixed.
- One Low remained: some Gmail callback failure branches still might not include attemptId, so error detail could still degrade in a few cases.
```

Fixes applied after Round 2:

- Added `attemptId` propagation where available in Gmail callback `code missing` and generic failure branches.

### Round 3 of 3

- Result: clean

Reviewer summary:

```text
- Gmail popup failure-branch attemptId handling is now resolved.
- No remaining Critical / High / Medium findings were found in scope.
```

## Validation

- `npm --workspace apps/bff run check`: PASS
- `npm --workspace apps/webui run check`: PASS
- `npm --workspace apps/bff run build`: PASS
- `npm --workspace apps/webui run build`: PASS
- `npm run harness:semantic`: PASS with pre-existing warnings outside this slice
- `npx prisma validate --schema apps/bff/prisma/schema.prisma`: PASS
- `npm run db:migrate:deploy`: PASS
- `curl -s http://127.0.0.1:8787/health`: PASS
- authenticated `POST http://127.0.0.1:8787/api/auth/login`: PASS
- authenticated `GET http://127.0.0.1:8787/api/mail/providers`: PASS
- authenticated `GET /api/mail/connections/gmail/direct/start?...`: PASS, returned Gmail popup with `GOOGLE_OAUTH_NOT_CONFIGURED` when Google client env is not configured
- `npm run check:standard`: FAIL in a pre-existing WebUI Playwright smoke path (`ignores stale manual processing results after switching mailbox sources`) outside this Gmail slice

## Final Status

No unresolved Critical, High, Medium, or Low findings remain for the Gmail direct OAuth slice. Gmail direct onboarding is now wired through BFF routes, tenant-bound token persistence, Gmail mail reads, and WebUI connect flows, with IMAP retained as fallback.
