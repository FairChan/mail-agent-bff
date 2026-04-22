# Mail Privacy HMAC Fix Audit

Timestamp: 2026-04-21T15:40:14+08:00

Scope:
- Reviewed `apps/bff/src/server.ts`
- Reviewed `apps/bff/src/mail-privacy.ts`
- Reviewed `apps/bff/src/agent/mastra-runtime.ts`
- Reviewed `apps/bff/src/agent/privacy-state-store.ts`
- Reviewed `apps/bff/scripts/mail-privacy-live-smoke.ts`
- Checked ignored local `apps/bff/.env` only for key presence; the secret value was not printed or copied.

Commands/checks:
- `git diff -- apps/bff/src/server.ts apps/bff/scripts/mail-privacy-live-smoke.ts apps/bff/src/mail-privacy.ts apps/bff/src/config.ts apps/bff/package.json`
- `rg -n "MAIL_PRIVACY_HMAC_KEY|mailPrivacyHmacKey|mailPrivacyReadiness|MailPrivacyError|NOT_READY|required" apps/bff/src apps/bff/scripts apps/bff/.env.example deploy -g '!apps/bff/.env'`
- `npm --workspace apps/bff run check` passed.
- Local env presence check passed: `MAIL_PRIVACY_ENABLED=true`, non-empty `MAIL_PRIVACY_HMAC_KEY`, `MAIL_PRIVACY_KEY_VERSION=v1`; secret not displayed.
- `curl http://127.0.0.1:8787/health` showed `ok=true`, `runtime.llm.ok=true`, model `Pro/zai-org/GLM-5.1`, and `runtime.mailPrivacy={ ok:true, enabled:true, keyVersion:"v1" }`.

Findings:

Low - Live privacy smoke can pass with a fallback HMAC key instead of proving the configured key exists.
- File: `apps/bff/scripts/mail-privacy-live-smoke.ts`
- Lines: 7-10, 151-180
- The smoke injects `local-mail-privacy-smoke-key` when `MAIL_PRIVACY_HMAC_KEY` is absent, then only exits non-zero when masking/leak assertions fail. This is useful for local algorithm testing, but as a "live" smoke it can pass even when the real environment is missing the key that caused the original agent failure. The current health/readiness check compensates when explicitly checked, so this is not a blocker. Suggested follow-up: add a strict mode or make this npm script fail when `usedFallbackHmacKey=true`, leaving fallback behavior to a separate local-only smoke.

Positive observations:
- `mailPrivacyReadiness()` fails closed when privacy is enabled and the HMAC key is missing, returning `MAIL_PRIVACY_NOT_READY` without exposing secret material (`apps/bff/src/mail-privacy.ts:715-739`).
- `MailPrivacyScope` asserts readiness before loading the HMAC key and stores only an in-memory `Buffer` from env, with no health/report exposure of the secret (`apps/bff/src/mail-privacy.ts:766-777`).
- `/health`, `/api/health`, `/ready`, and `/api/ready` include `runtime.mailPrivacy` with `ok`, `enabled`, `keyVersion`, optional code/error, and include privacy readiness in the overall ready boolean for the Mastra/SiliconFlow runtime (`apps/bff/src/server.ts:7380-7486`).
- Agent chat creates/loads a privacy scope before sending user text to the model and maps `MailPrivacyError` to a 503-style agent error code path (`apps/bff/src/agent/mastra-runtime.ts:145-193`, `apps/bff/src/server.ts:14015-14131`).
- The smoke now asserts structured sender/recipient placeholders, Graph recipient placeholders, free-text address stripping, raw LLM output leak checks, and non-zero exit on assertion failure (`apps/bff/scripts/mail-privacy-live-smoke.ts:127-180`).

Final status:
- No Critical, High, or Medium findings.
- One Low follow-up noted; safe to defer.
- No secret value was exposed in this audit report.

## Round 2 Follow-Up

Timestamp: 2026-04-21T15:42:19+08:00

Scope:
- Re-reviewed `apps/bff/scripts/mail-privacy-live-smoke.ts` only for the Low fallback-key finding.
- Did not edit application code.
- Did not print or copy `MAIL_PRIVACY_HMAC_KEY`.

Commands/checks:
- `nl -ba apps/bff/scripts/mail-privacy-live-smoke.ts | sed -n '1,230p'`
- `npm --workspace apps/bff run check` passed.
- `MAIL_PRIVACY_HMAC_KEY= MAIL_PRIVACY_SMOKE_ALLOW_FALLBACK_KEY=false npm --workspace apps/bff run smoke:mail-privacy-live` failed before running the live smoke with the expected missing-key error.
- `git diff --check -- apps/bff/src/server.ts apps/bff/scripts/mail-privacy-live-smoke.ts` passed.

Resolution:
- The prior Low finding is fixed. The script now requires `MAIL_PRIVACY_SMOKE_ALLOW_FALLBACK_KEY=true` before it may inject the local fallback key (`apps/bff/scripts/mail-privacy-live-smoke.ts:7-14`).
- With fallback disabled and the key empty, the script throws immediately, so the standard live smoke can no longer pass while silently substituting the fallback HMAC key.

Final status:
- No Critical, High, Medium, or Low findings remain.
- Final audit status: clean.
