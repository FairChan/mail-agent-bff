# Google Gmail OAuth Local Configuration Audit

- Timestamp: `2026-04-21T14:55:43+08:00`
- Task type: `Code`
- Scope:
  - Added local Google OAuth client configuration to ignored `apps/bff/.env`.
  - Restarted BFF and validated Gmail direct OAuth start/status wiring without recording OAuth secrets.
- Secret handling:
  - OAuth client secret was written only to the ignored local env file.
  - This audit document intentionally omits the client secret.

## Validation

- `npm --workspace apps/bff run check` passed.
- BFF restarted successfully on `http://127.0.0.1:8787`.
- `/health` returned `ok: true`, `google.ok: true`, and `prisma.ok: true`.
- Authenticated Gmail direct OAuth start smoke:
  - Admin login returned `200`.
  - `GET /api/mail/connections/gmail/direct/start?...` returned `HTTP/1.1 302 Found`.
  - Redirect target host was `accounts.google.com`.
  - Generated auth URL contained `client_id`, `redirect_uri`, and Gmail readonly scope.
  - `GET /api/mail/connections/gmail/direct/status?...` returned `provider: "gmail"` and `state: "pending"` for the same attempt.
- Google auth URL probe:
  - Google returned sign-in content.
  - No immediate `invalid_client` or `redirect_uri_mismatch` error was detected.

## Independent Sub-Agent Audit

- Round 1:
  - Tool/model: `spawn_agent` independent explorer, `gpt-5.4-mini`
  - Agent: `Parfit` (`019daed1-a280-7d13-9338-4fec4b36b9fd`)
  - Constraint: auditor was explicitly instructed not to open or print `apps/bff/.env`.
  - Result:
    > None. I did not find any Critical, High, Medium, or Low issues in the non-secret Gmail OAuth path you pointed me at.
    >
    > The validation evidence is sufficient for the narrow claim you asked about. The code builds the Google auth URL from `env.googleClientId` and `env.googleRedirectUri`, includes Gmail readonly scope, and the status endpoint is session-scoped and reads the persisted attempt state. That matches the observed `302` to `accounts.google.com`, the presence of `client_id`, `redirect_uri`, and scope, and `/direct/status` returning `provider=gmail` with `state=pending` in the same session.
    >
    > What it does not prove is full callback/token-exchange completion, since the probe stopped at the Google sign-in page. But for config correctness and start/status wiring, the evidence holds up.

## Final Status

- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`
- Remaining manual step: complete the Google sign-in/consent flow in the browser once to prove callback token exchange and mailbox source creation.
