# 2026-04-21 OAuth Popup Recovery + Multi-Mail Connect Audit

- Task type: Code
- Timestamp: 2026-04-21T09:14:36+08:00
- Scope: harden Outlook/Gmail popup completion handling, unify the sidebar connect-mail modal across OAuth + IMAP providers, and add shared persistence for direct-auth attempt state.

## Files Reviewed

- `apps/webui/src/contexts/MailContext.tsx`
- `apps/webui/src/components/layout/Sidebar.tsx`
- `apps/webui/src/components/dashboard/SettingsView.tsx`
- `apps/webui/src/utils/mailConnectionFeedback.ts`
- `apps/bff/src/server.ts`
- `apps/bff/prisma/schema.prisma`
- `apps/bff/prisma/migrations/202604210930_direct_auth_attempts/migration.sql`

## Independent Audit

- Reviewer: sub-agent `Goodall` (`019dad79-e9fa-7bc3-a1c7-4e2c114ffacf`)

### Round 1 of 3

- Result: 2 High, 2 Medium

Reviewer summary:

```text
- High: OAuth popup postMessage validation was still too permissive. Same-origin windows could spoof success/failure because attemptId was not mandatory and event.source was not enforced.
- High: Popup-close recovery still depended on process-local attempt state. In multi-instance or process-restart scenarios the frontend could still observe unknown state.
- Medium: direct/status only checked for the presence of a cookie, not whether the auth session was still active.
- Medium: several terminal branches still returned popup HTML without writing a final attempt state, so popup-close recovery could fall back to "window closed" on some failures.
```

Fixes applied after Round 1:

- Tightened popup message acceptance so OAuth completion only resolves from the original popup window, from an allowed auth origin set, and with an exact `attemptId` match.
- Extended popup-close recovery polling and stopped treating `unknown` as an immediate terminal state.
- Added shared persisted `DirectAuthAttempt` storage in Prisma, plus BFF load/save/cleanup helpers so callback/status no longer rely only on one process's in-memory map.
- Hardened `/api/mail/connections/{outlook,gmail}/direct/status` to run real session validation before returning attempt state.
- Backfilled missing terminal attempt writes in key failure branches, including OAuth start rate limiting and callback-side session-expiry returns after OAuth completion.

### Round 2 of 3

- Result: clean for Critical/High

Reviewer summary:

```text
- Critical: none.
- High: none.
- Previous popup spoofing concern resolved: event.source, origin allowlist, and attemptId must all line up before frontend settlement.
- Previous shared-state concern resolved: attempt state is now persisted and loaded from a shared durable layer instead of process memory only.
- Session validation and missing terminal-state writes were also fixed in the audited routes.
```

## Validation

- `cd apps/bff && npx prisma generate --schema prisma/schema.prisma`: PASS
- `npm run db:migrate:deploy`: PASS
- `npm --workspace apps/bff run check`: PASS
- `npm --workspace apps/webui run check`: PASS
- `npm --workspace apps/bff run build`: PASS
- `npm --workspace apps/webui run build`: PASS
- `npm run harness:semantic`: PASS (warnings only in pre-existing unrelated files)
- `git diff --check -- apps/bff/src/server.ts apps/webui/src/contexts/MailContext.tsx apps/bff/prisma/schema.prisma apps/bff/prisma/migrations/202604210930_direct_auth_attempts/migration.sql apps/webui/src/components/layout/Sidebar.tsx apps/webui/src/components/dashboard/SettingsView.tsx apps/webui/src/utils/mailConnectionFeedback.ts`: PASS
- `curl -s http://127.0.0.1:8787/health`: PASS
- authenticated `POST http://127.0.0.1:8787/api/auth/login`: PASS
- authenticated `GET http://127.0.0.1:8787/api/mail/providers`: PASS
- authenticated `GET /api/mail/connections/outlook/direct/start?...`: PASS (returned Microsoft authorize redirect)
- authenticated `GET /api/mail/connections/outlook/direct/status?attemptId=...`: PASS (`pending`)

## Operational Note

- With `REDIS_AUTH_SESSIONS_ENABLED=false` on this local machine, a full BFF restart still invalidates in-memory browser sessions. That means restart-during-auth can still become `401 Unauthorized` after the restart even though direct-auth attempt state is now durable. This is an auth-session durability limitation outside the popup/connect slice; it did not block the audited Critical/High issues from being fixed.

## Final Status

No unresolved Critical or High findings remain in the audited slice. Outlook/Gmail popup completion, popup-close recovery, and the unified multi-mail connect entry are ready for local testing on the current machine.
