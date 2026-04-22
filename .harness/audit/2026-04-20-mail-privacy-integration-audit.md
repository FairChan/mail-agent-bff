# 2026-04-20 Mail Privacy Integration Audit

- Task type: Code
- Timestamp: 2026-04-20T18:48:15+08:00
- Scope: synced remote mail privacy feature files from `origin/master`, fixed address stripping gaps, removed prompt-level internal identifier exposure, strengthened privacy smoke coverage, and added deployment documentation.

## Files Reviewed

- `apps/bff/.env.example`
- `apps/bff/package.json`
- `apps/bff/prisma/schema.prisma`
- `apps/bff/prisma/migrations/202604201230_mail_privacy_state/migration.sql`
- `apps/bff/scripts/mail-privacy-live-smoke.ts`
- `apps/bff/src/agent/index.ts`
- `apps/bff/src/agent/mail-skills.ts`
- `apps/bff/src/agent/mastra-runtime.ts`
- `apps/bff/src/agent/openclaw-runtime.ts`
- `apps/bff/src/agent/privacy-state-store.ts`
- `apps/bff/src/config.ts`
- `apps/bff/src/email-ai-summary.ts`
- `apps/bff/src/mail-analysis.ts`
- `apps/bff/src/mail-privacy.ts`
- `apps/bff/src/notification-service.ts`
- `apps/bff/src/server.ts`
- `apps/bff/src/summary.ts`
- `apps/bff/src/webhook-handler.ts`
- `deploy/docs/MAIL_PRIVACY_DELIVERY.md`

## Independent Audit

- Reviewer: sub-agent `Lovelace` (`019daa5b-2f14-7581-89e8-d062e604e6e6`)
- Round: 1 of 3
- Result: clean, no findings

Reviewer summary:

```text
No findings in round 1 for the requested local mail privacy changes.

The current working tree appears to fix the issues from the prior remote audit:

- Flat sender/recipient fields are stripped via placeholders.
- Graph-shaped from.emailAddress.address, toRecipients[].emailAddress.address, ccRecipients[], bccRecipients[], and reply-to style paths are covered by path segment matching.
- Free-text email addresses are stripped to [email] before entity pseudonymization.
- Main BFF-to-LLM paths reviewed are wrapped.
- Direct Composio Mastra tools are disabled when privacy wrapping is active.
- Thread privacy state checks userId/sourceId, expires old rows, and stores encrypted snapshots.
- The live smoke covers flat addresses, Graph-shaped addresses, free-text stripping, masked payload leakage, and model-output leakage.

Validation: npm --workspace apps/bff run check passed.

Residual risk/test gaps: smoke:mail-privacy-live was not run because it makes an external LLM call.
```

## Validation

- Local privacy assertion script with synthetic samples: PASS
  - flat `fromAddress -> [sender-email]`
  - flat `toAddress -> [recipient-email]`
  - Graph `toRecipients[].emailAddress.address -> [recipient-email]`
  - free-text addresses stripped to `[email]`
- Fail-closed assertion with `MAIL_PRIVACY_ENABLED=true` and empty `MAIL_PRIVACY_HMAC_KEY`: PASS (`MAIL_PRIVACY_NOT_READY`)
- `DATABASE_URL=postgresql://user:pass@localhost:5432/mail_agent npx prisma validate --schema apps/bff/prisma/schema.prisma`: PASS
- `npm --workspace apps/bff run check`: PASS
- `npm --workspace apps/bff run build`: PASS
- `npm run check:repo-boundary`: PASS

## Final Status

No unresolved Critical, High, Medium, or Low findings remain from the independent audit round. The only explicit residual gap is that the external-provider live smoke was not executed during this task because it would use a real LLM call.
