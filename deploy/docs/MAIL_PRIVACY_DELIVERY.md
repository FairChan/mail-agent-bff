# Mail Privacy Delivery Guide

## Purpose

This feature protects the BFF-to-LLM boundary for mail processing:

- local mail data enters the BFF
- sender / recipient mailbox address fields are stripped before LLM calls
- sensitive free-text entities are pseudonymized locally with fixed-length HMAC-derived aliases
- only masked payloads are sent to the model provider
- masked model output is restored locally before returning user-visible results

This does not replace local storage, mailbox retrieval, frontend rendering, or tenant isolation. It wraps the mail-to-model transit layer.

## Main Files

- `apps/bff/src/mail-privacy.ts`
- `apps/bff/src/agent/privacy-state-store.ts`
- `apps/bff/src/agent/mastra-runtime.ts`
- `apps/bff/src/agent/openclaw-runtime.ts`
- `apps/bff/src/agent/mail-skills.ts`
- `apps/bff/src/server.ts`
- `apps/bff/src/summary.ts`
- `apps/bff/src/email-ai-summary.ts`
- `apps/bff/src/mail-analysis.ts`
- `apps/bff/src/webhook-handler.ts`
- `apps/bff/prisma/schema.prisma`
- `apps/bff/prisma/migrations/202604201230_mail_privacy_state/migration.sql`
- `apps/bff/scripts/mail-privacy-live-smoke.ts`

## Required Environment

Start from `apps/bff/.env.example`.

Minimum privacy-related values:

```env
MAIL_PRIVACY_ENABLED=true
MAIL_PRIVACY_HMAC_KEY=replace-with-a-stable-secret
MAIL_PRIVACY_KEY_VERSION=v1
APP_ENCRYPTION_KEY=replace-with-32-plus-random-characters
```

Other required BFF settings still apply:

```env
BFF_API_KEY=replace-with-at-least-16-random-characters
DATABASE_URL=postgresql://...
LLM_PROVIDER_BASE_URL=https://...
LLM_PROVIDER_API_KEY=...
LLM_PROVIDER_MODEL=...
AGENT_RUNTIME=mastra
```

## Key Rules

- `MAIL_PRIVACY_HMAC_KEY` must stay stable across nodes in the same deployment.
- `MAIL_PRIVACY_KEY_VERSION` changes only when intentionally rotating privacy masking behavior.
- `APP_ENCRYPTION_KEY` must stay stable if the node needs to decrypt existing `AgentPrivacyState` rows.

## Address Handling

Current behavior by design:

- `fromAddress` and sender-address fields become `[sender-email]`
- `toAddress`, `ccAddress`, `bccAddress`, `replyToAddress`, and Graph recipient address paths become `[recipient-email]`
- free-text email addresses in previews / prompts / quoted headers are stripped to `[email]`
- stripped placeholders are not restored from model output
- display names and other proper nouns are pseudonymized locally and restored locally

## Bring-Up Steps

1. Clone the repository.
2. Run `npm ci` from repo root.
3. Copy `apps/bff/.env.example` to `apps/bff/.env` and fill required values.
4. Apply the migration:

```bash
npm run db:migrate:deploy
```

5. Start the BFF:

```bash
npm --workspace apps/bff run dev
```

or

```bash
npm --workspace apps/bff run build
npm --workspace apps/bff run start
```

6. Run the privacy smoke:

```bash
npm --workspace apps/bff run smoke:mail-privacy-live
```

Expected smoke result shape:

- `ok: true`
- `checks.maskedLeaks: []`
- `checks.maskedGraphLeaks: []`
- `checks.rawOutputLeaks: []`
- `checks.assertionFailures: []`

## Operational Notes

- If `MAIL_PRIVACY_ENABLED=true` and `MAIL_PRIVACY_HMAC_KEY` is missing, privacy-bound paths fail closed.
- If PostgreSQL is unavailable, per-request masking still works in-process, but persisted agent-thread privacy state is unavailable.
- If `APP_ENCRYPTION_KEY` changes, old persisted privacy snapshots cannot be decrypted.
- The smoke script may inject a local fallback HMAC key only for local testing when the env var is absent. Real deployments must set a real `MAIL_PRIVACY_HMAC_KEY`.

## Known Limitation

The privacy feature is integrated, but full `apps/bff` typecheck may still be blocked by older KB/shared-type drift outside the privacy layer. Validate privacy behavior with the dedicated smoke and targeted checks even when unrelated BFF type issues remain.
