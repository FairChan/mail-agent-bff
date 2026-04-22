# Registration Gmail Verification Audit

- Timestamp: `2026-04-21T14:15:43+08:00`
- Task type: `Code`
- Scope:
  - Activated local Gmail SMTP delivery for registration verification codes via ignored `apps/bff/.env`.
  - Added reusable live registration smoke coverage in `apps/bff/scripts/auth-registration-live-smoke.ts`.
  - Documented SMTP settings in `apps/bff/.env.example`.
  - Hardened frontend API wrappers so empty-body requests no longer send `Content-Type: application/json`.
- Changed files reviewed:
  - `apps/bff/.env.example`
  - `apps/bff/package.json`
  - `apps/bff/scripts/auth-registration-live-smoke.ts`
  - `apps/webui/src/utils/api.ts`
  - `apps/webui/src/contexts/AuthContext.tsx`
- Secret handling:
  - The Gmail app password was used only in the ignored local env file.
  - Audit evidence and project notes intentionally omit the app password and one-time verification codes.

## Validation

- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/bff run smoke:auth-registration-live` passed.
  - Real SMTP delivery returned `delivery: "sent"`.
  - Gmail IMAP polling found the verification email.
  - Verification succeeded and established an authenticated session.
  - Logout succeeded after frontend/header hardening.
  - Password login succeeded after verification.
  - Session check after login returned authenticated.
- `npm --workspace apps/webui run check` passed.
- `npm --workspace apps/webui run build` passed.
- Local WebUI preview was rebuilt and restarted on `http://127.0.0.1:4173/`.
- `git diff --check -- apps/bff/.env.example apps/bff/package.json apps/bff/scripts/auth-registration-live-smoke.ts apps/webui/src/utils/api.ts apps/webui/src/contexts/AuthContext.tsx` passed.

## Independent Sub-Agent Audit

- Attempt note: an initial audit sub-agent did not return a usable report, so it was retried before delivery.
- Round 1:
  - Tool/model: `spawn_agent` independent explorer, `gpt-5.4-mini`
  - Agent: `Turing` (`019daeac-b69a-7863-96f9-95e9d4842446`)
  - Result:
    > I reviewed the five requested files directly and did not find any issues to flag. No Critical or High findings remain.
    >
    > The SMTP verification smoke script is internally consistent with the env additions, and the frontend header changes now preserve caller-supplied headers while only defaulting JSON when there is a request body.

## Final Status

- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`
- Final audit status: clean.
