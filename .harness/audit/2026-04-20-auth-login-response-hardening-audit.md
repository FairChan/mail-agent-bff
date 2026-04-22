# 2026-04-20 Auth Login Response Hardening Audit

- Task type: Code
- Timestamp: 2026-04-20T20:22:22+08:00
- Scope: fixed the local admin login crash surfaced as `Failed to execute 'json' on 'Response': Unexpected end of JSON input` by hardening WebUI response parsing and aligning Vite preview proxy behavior with the dev server.

## Files Reviewed

- `apps/webui/src/utils/http.ts`
- `apps/webui/src/App.tsx`
- `apps/webui/src/contexts/AuthContext.tsx`
- `apps/webui/src/contexts/MailContext.tsx`
- `apps/webui/src/utils/api.ts`
- `apps/webui/vite.config.ts`

## Independent Audit

- Reviewer: sub-agent `Bernoulli` (`019daad4-bc44-7852-a41c-8f33996b2656`)
- Round: 1 of 3
- Result: clean, no findings

Reviewer summary:

```text
Clean. I didn’t find any correctness, typing, or regression issues in the touched files, and the new safe response parsing does address the empty/non-JSON login failure mode without reintroducing `Response.json()` on the auth path. `npm --workspace apps/webui run check` passed.
```

## Validation

- `npm --workspace apps/webui run check`: PASS
- `npm --workspace apps/webui run build`: PASS
- `npm run harness:semantic`: PASS with pre-existing backend warnings only
- `git diff --check -- apps/webui/src/utils/http.ts apps/webui/src/App.tsx apps/webui/src/contexts/AuthContext.tsx apps/webui/src/contexts/MailContext.tsx apps/webui/src/utils/api.ts apps/webui/vite.config.ts`: PASS
- `curl -i -sS -X POST http://127.0.0.1:4173/api/auth/login ... admin@true-sight.local / MeryAdmin2026!`: PASS (`200`)
- `curl -i -sS -X POST http://127.0.0.1:4173/api/auth/login ... admin@true-sight.local / wrong`: PASS (`401`)
- Synthetic parser smoke:
  - empty `500` response body now maps to `Server temporarily unavailable. Please try again.`

## Final Status

No unresolved Critical, High, Medium, or Low findings remain from the independent audit round. Local preview (`4173`) and BFF (`8787`) were relaunched after the fix for manual testing.
