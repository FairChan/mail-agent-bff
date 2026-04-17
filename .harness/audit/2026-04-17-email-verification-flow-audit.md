# Email Verification Registration Flow Audit

- Timestamp: 2026-04-17T12:35:58+08:00
- Task type: Code
- Implementer: Codex main session
- Reviewer: Sub-agent `019d99b5-005c-7533-9f5f-6c5fd940fedd` (`gpt-5.4-mini`, nickname Archimedes)
- Scope:
  - `apps/bff/src/server.ts`
  - `apps/bff/src/email.ts`
  - `apps/bff/src/api-schema.json`
  - `apps/webui/src/contexts/AuthContext.tsx`
  - `apps/webui/src/components/auth/ContextAuthScreen.tsx`
  - `apps/webui/src/utils/api.ts`
  - `apps/webui/src/utils/errors.ts`
  - `packages/shared-types/src/index.ts`
  - ignored local config strategy in `apps/bff/.env`

## Sub-agent Findings

- Critical: 0
- High: 0
- Medium: 1
- Low: 3

### Medium

Pending registration state is in memory only. A BFF restart or multi-instance deployment loses pending verification records, so a user who already received a code would need to register again.

- Decision: deferred.
- Rationale: the current local harness disables Prisma auth and Redis session persistence by default. A durable pending-registration store should be designed with the same deployment choice as auth session persistence (Redis or DB), instead of adding an incomplete one-off file or memory fallback.
- Owner: project backend.
- Target date: 2026-04-24.

### Low

Gmail SMTP is configured with safe non-secret defaults, but real delivery is disabled until a Gmail App Password or OAuth refresh token is provided.

- Decision: deferred.
- Rationale: no Gmail App Password or OAuth refresh token was provided in this task. Keeping `SMTP_ENABLED=false` prevents startup failure and keeps local verification testable through development logs.
- Owner: user/developer.
- Target date: when Gmail App Password is available.

### Low

Shared auth contract and friendly error mapping drifted from the new backend error codes and register response shape.

- Decision: fixed.
- Fix: updated `AuthRegisterEnvelope`, added `AuthResendVerificationEnvelope`, and mapped `INVALID_VERIFICATION_CODE`, `VERIFICATION_CODE_EXPIRED`, `VERIFICATION_NOT_FOUND`, and `VERIFICATION_SEND_FAILED`.

### Low

Automated tests do not yet cover the new register -> verify success path, resend cooldown, or code expiry.

- Decision: deferred.
- Rationale: the current email sender intentionally does not expose verification codes through API responses; deterministic E2E coverage should use a dedicated test transport or fixture hook rather than weakening production responses.
- Owner: project QA/backend.
- Target date: 2026-04-24.

## Validation Evidence

- `npm --workspace apps/bff run check`: passed
- `npm --workspace apps/webui run check`: passed
- `npm --workspace apps/bff run build`: passed
- `npm --workspace apps/webui run build`: passed
- `npm run harness:semantic -- apps/bff/src/server.ts apps/bff/src/email.ts apps/bff/src/api-schema.json apps/webui/src/contexts/AuthContext.tsx apps/webui/src/components/auth/ContextAuthScreen.tsx apps/webui/src/utils/api.ts apps/webui/src/utils/errors.ts packages/shared-types/src/index.ts`: passed with existing zod warning at `apps/bff/src/server.ts:4380`
- Runtime API flow:
  - `POST /api/auth/register`: `202`, `pending=true`, `delivery=logged`
  - development log verification code received
  - `POST /api/auth/verify`: `201`, user created, `Set-Cookie` returned
  - `GET /api/auth/session`: authenticated user returned
- `npm run harness:smoke`: 10/10 passed
- `npm run check:standard`: `HARNESS_STANDARD_OK`

## Final Status

- Critical: 0
- High: 0
- Medium: 1 deferred with rationale
- Low: 2 deferred with rationale, 1 fixed
