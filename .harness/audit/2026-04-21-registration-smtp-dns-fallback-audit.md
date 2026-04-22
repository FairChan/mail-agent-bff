# Registration SMTP DNS Fallback Audit

- Timestamp: `2026-04-21T15:37:08+08:00`
- Task type: `Code`
- Trigger:
  - WebUI registration showed `Failed to send verification email. Please check email settings and try again.`
- Root cause:
  - BFF log for the failed registration showed transient DNS resolution failure:
    - `getaddrinfo ENOTFOUND smtp.gmail.com`
  - The Gmail app password and registration logic were valid; later direct live smoke passed with real delivery.
- Scope:
  - `apps/bff/src/email.ts`
  - `apps/bff/scripts/auth-registration-live-smoke.ts`

## Changes

- Added SMTP transporter caching by host instead of one global SMTP transporter.
- Added Gmail SMTP fallback host support:
  - Primary remains `smtp.gmail.com`.
  - When the primary host fails after retries and the configured host is Gmail, BFF tries `gmail-smtp-msa.l.google.com`.
- Hardened the live registration smoke:
  - Gmail plus aliases now include timestamp plus random bytes to avoid collision under concurrent smoke runs.
  - The smoke now asserts session outcomes instead of only printing them:
    - verification creates an authenticated session
    - logout clears the session
    - login recreates an authenticated session

## Validation

- DNS lookup currently resolves both `smtp.gmail.com` and `gmail-smtp-msa.l.google.com`.
- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/bff run build` passed.
- `npm --workspace apps/bff run smoke:auth-registration-live` passed.
- `SMTP_HOST=gmail-smtp-msa.l.google.com npm --workspace apps/bff run smoke:auth-registration-live` passed before the smoke assertion hardening, proving the fallback SMTP host is usable.
- BFF was rebuilt and restarted on `http://127.0.0.1:8787`.
- WebUI proxy registration smoke through `http://127.0.0.1:4173/api/auth/register` returned `202` with `delivery: "sent"`.
- Final BFF health is green.
- `git diff --check -- apps/bff/src/email.ts apps/bff/scripts/auth-registration-live-smoke.ts` passed.

## Independent Sub-Agent Audit

- Round 1:
  - Tool/model: `spawn_agent` independent explorer, `gpt-5.4-mini`
  - Agent: `Archimedes` (`019daef4-cdf5-7c71-89dd-8bb8a8b11c7f`)
  - Result:
    - No Critical or High findings.
    - One Low finding: smoke printed session states but did not assert them.
- Round 1 fix:
  - Added hard assertions for `sessionAfterVerify`, `logout`, `sessionAfterLogout`, and `sessionAfterLogin`.
- Round 2:
  - Tool/model: `spawn_agent` independent explorer, `gpt-5.4-mini`
  - Agent: `Halley` (`019daef7-4bf3-7373-9cf9-abc1c629319f`)
  - Result:
    - Critical: `0`
    - High: `0`
    - Medium: `0`
    - Low: `0`

## Final Status

- Final audit status: clean.
- User-facing state: local WebUI registration should now proceed to the verification-code step instead of failing on transient `smtp.gmail.com` DNS resolution.
