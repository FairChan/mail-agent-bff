# Outlook Direct Auth Callback Audit - 2026-04-17

- Timestamp: 2026-04-17T11:20:06+08:00
- Task type: Code
- Implementer: Codex main session
- Independent reviewer: sub-agent `Nietzsche` (`019d996f-dcab-7903-b578-34438345f90d`)
- Reviewer model metadata: unavailable in returned tool payload

## Scope

Fix Microsoft Outlook direct-auth popup returning raw JSON `{"ok":false,"error":"Unauthorized"}` after Microsoft redirects back to:

`/api/mail/connections/outlook/direct/callback`

## Reviewed Files

- `apps/bff/src/server.ts`
- `apps/bff/src/microsoft-graph.ts`

## Initial Audit Findings

- Critical: 0
- High: 0
- Medium: 2
- Low: 1

### Medium 1

Callback completed token exchange and stored the Microsoft token before confirming the original local session was still active.

Resolution: Fixed. `completeMicrosoftDirectAuth()` now accepts an `ensureSessionActive` callback and checks the source session before token exchange and again before token persistence.

### Medium 2

The direct-auth start/callback routes bypassed the global auth hook's Redis hydration and revocation semantics.

Resolution: Fixed. Added `touchAuthSessionForRequest()` and reused it from the global hook, direct-auth start route, and direct-auth callback flow.

### Low 1

Direct-auth start route did not have route-level rate limiting.

Resolution: Fixed. Added per-session/per-IP rate limiting for `/api/mail/connections/outlook/direct/start`.

## Final Validation

- `npm --workspace apps/bff run check`: passed.
- `npm --workspace apps/bff run build`: passed.
- `npm run harness:semantic -- apps/bff/src/server.ts apps/bff/src/microsoft-graph.ts`: passed with one existing zod safeParse warning in `apps/bff/src/server.ts`.
- `GET http://127.0.0.1:8787/health`: passed with `ok=true`, `siliconFlow.ok=true`, `microsoft.ok=true`.
- Unauthenticated `GET http://localhost:8787/api/mail/connections/outlook/direct/callback?code=bogus&state=bogus`: returned `200 text/html`, not raw `401` JSON.
- Unauthenticated direct-auth start route: returned friendly `200 text/html` popup error, not raw `401` JSON.
- Authenticated direct-auth start route: returned `302` to Microsoft authorize URL with the correct app `client_id` and localhost redirect URI.
- `npm run harness:smoke`: passed (`10/10`).

## Final Audit Status

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

