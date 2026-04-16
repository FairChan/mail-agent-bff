# 2026-04-16 Local Site Enable Audit

## Scope

- WebUI auth shell and language controls
- Mail settings/source-management integration
- Mail detail rendering hardening
- Smoke coverage for the local site
- Local `apps/bff/.env` operational risk

## Independent Audit Evidence

### Round 1

- Timestamp: `2026-04-16T20:17:43+08:00`
- Tool: `sub-agent audit`
- Reviewer: `Parfit` (`019d95dc-b9de-7ca1-a096-ade5d3914aed`)
- Model: unavailable in returned tool metadata for this pre-existing reviewer session
- Result summary:
  - `Critical=0`
  - `High=2`
  - `Medium=2`
  - `Low=0`
- Findings received through the agent review channel:
  1. High: WebUI register payload still used `displayName` while BFF expected `username`.
  2. High: `MailDetailPage` rendered short HTML mail bodies without full sanitization.
  3. Medium: `apps/bff/.env` stores a live provider key in cleartext.
  4. Medium: knowledge-base WebUI paths still depend on routes that are not confirmed in the active `server.ts` runtime.

### Audit-driven fixes applied

- `apps/webui/src/contexts/AuthContext.tsx`
  - aligned register payload to `{ email, username, password }`
  - consumed the BFF register response directly instead of issuing a second login request
- `apps/webui/src/components/dashboard/MailDetailPage.tsx`
  - added `DOMPurify` sanitization for HTML bodies
  - plain-text bodies are now escaped before line-break conversion

### Follow-up reviewer attempts

- `Sartre` (`019d961c-b474-73d2-bd03-64bc5b46b329`), requested model `gpt-5.4-mini`
  - status: failed due platform usage-limit error before review output
- `Archimedes` (`019d9639-26c9-7f71-a7ff-645c14334c2f`), requested model `gpt-5.1-codex-mini`
  - status: failed because that model is unsupported for this ChatGPT Codex account
- `Helmholtz` (`019d95d6-e064-73e2-bb51-c911341b1131`)
  - status: follow-up request timed out without a textual result

Because the completed independent review identified only two High findings and both were fixed, final delivery below is based on:

1. the completed independent audit result from `Parfit`
2. code changes that addressed every High finding
3. rerun validation after those fixes

## Post-fix validation

- `npm --workspace apps/webui run check` passed
- `npm --workspace apps/webui run build` passed
- `npm run harness:smoke` passed (`10/10`)
- Local service verification passed:
  - WebUI reachable on `http://127.0.0.1:5173`
  - BFF responding on `http://127.0.0.1:8787`
  - local register + authenticated session probe succeeded

## Final Audit Status

- `Critical=0`
- `High=0`
- `Medium=2`
- `Low=0`

## Deferred Medium Risks

1. `apps/bff/.env` contains a real local SiliconFlow key.
   - Rationale: the user explicitly requested immediate local enablement, and local access now works.
   - Owner: `fairchan`
   - Target date: `2026-04-16`
   - Required follow-up: rotate the key and replace the local value with the new secret.

2. Knowledge-base WebUI flows still rely on routes that are not confirmed in the active monolithic `apps/bff/src/server.ts` runtime.
   - Rationale: this does not block login, settings, local site access, or the smoke-tested landing/auth flow completed in this task.
   - Owner: `Codex`
   - Target date: `2026-04-17`
   - Required follow-up: either register the KB route set in the active server or hide/feature-flag the KB surface until registration is complete.

## Delivery Recommendation

Deliverable is acceptable for the requested local-site enablement scope:

- local site is reachable
- auth shell is working
- smoke suite passes
- no unresolved `Critical` or `High` findings remain

