# 2026-04-16 Outlook Direct Auth Audit

- Timestamp: `2026-04-16T20:55:06+08:00`
- Scope:
  - `apps/bff/src/config.ts`
  - `apps/bff/src/microsoft-graph.ts`
  - `apps/bff/src/mail.ts`
  - `apps/bff/src/server.ts`
  - `apps/webui/src/contexts/MailContext.tsx`
  - `apps/webui/src/components/dashboard/SettingsView.tsx`
  - `apps/bff/.env`

## Validation

- `npm --workspace apps/bff run check` passed
- `npm --workspace apps/bff run build` passed
- `npm --workspace apps/webui run check` passed
- `npm --workspace apps/webui run build` passed
- `npm run harness:semantic -- apps/bff/src/config.ts apps/bff/src/microsoft-graph.ts apps/bff/src/mail.ts apps/bff/src/server.ts apps/webui/src/contexts/MailContext.tsx apps/webui/src/components/dashboard/SettingsView.tsx` passed with warning-only pre-existing safeParse reminders in older files
- `npm run harness:smoke` passed (`10/10`)
- Local route verification:
  - `GET /health` shows `runtime.mode=direct`, `siliconFlow.ok=true`, `composio.ok=false`, `microsoft.ok=false`
  - signed-in `GET /api/mail/connections/outlook/direct/start?...&attemptId=...` returned the new popup page and echoed the attempt nonce

## Independent Audit Evidence

### Round 1

- Reviewer: `Parfit` (`019d95dc-b9de-7ca1-a096-ade5d3914aed`)
- Result:
  - `Critical=0`
  - `High=0`
  - `Medium=2`
  - `Low=1`
- Findings:
  1. `Medium`: Microsoft endpoint parsing could throw raw `SyntaxError` on non-JSON upstream responses.
  2. `Medium`: popup flow lacked a one-time nonce and relied only on the popup window handle.
  3. `Low`: local `.env` still contains a plain-text SiliconFlow key.

### Fixes applied after Round 1

- Wrapped Microsoft token/profile/Graph response parsing in controlled error handling inside `apps/bff/src/microsoft-graph.ts`.
- Added a per-popup `attemptId` nonce:
  - generated in `apps/webui/src/contexts/MailContext.tsx`
  - stored through Microsoft auth state in `apps/bff/src/microsoft-graph.ts`
  - echoed back from `apps/bff/src/server.ts`
  - required before resolving the popup auth handshake in the WebUI

### Round 2

- Reviewer: `Parfit` (`019d95dc-b9de-7ca1-a096-ade5d3914aed`)
- Final result:
  - `Critical=0`
  - `High=0`
  - `Medium=1`
  - `Low=1`
- Remaining findings:
  1. `Medium`: knowledge-base routes are still not wired into the active monolithic `apps/bff/src/server.ts`, so KB UI calls can still 404. This predates the Outlook direct-auth change and was not expanded in this task.
  2. `Low`: local `apps/bff/.env` still contains a plain-text SiliconFlow key.

## Deferred Items

- `Medium`: KB route registration / feature-flag alignment.
  - Owner: `Codex`
  - Target: `2026-04-17`
  - Rationale: unrelated to the Microsoft direct-auth request; changing it here would broaden the blast radius beyond this task.

- `Low`: rotate the local SiliconFlow key and keep it out of copied/shared local env files.
  - Owner: `fairchan`
  - Target: `2026-04-16`
  - Rationale: local-only secret exposure, not a blocker for this code path.
