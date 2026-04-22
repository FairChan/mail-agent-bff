# Important Mail Notification Audit - 2026-04-21

- Task type: Code
- Implementer: Codex main session
- Independent reviewer: sub-agent `019daeac-b69a-7863-96f9-95e9d4842446`
- Scope:
  - `apps/bff/src/server.ts`
  - `apps/bff/src/google-gmail.ts`
  - `apps/bff/.env.example`

## Changes Reviewed

- Notification triage now aligns with knowledge-base quadrants, while still allowing fresh realtime heuristic urgent-important candidates to alert before KB processing catches up.
- Realtime urgent fallback candidates are prioritized before older KB urgent mail before the notification candidate list is capped.
- Gmail inbox metadata fetches are concurrency-limited and fail the list request on any post-retry partial metadata failure instead of returning an incomplete `ok` result that could miss urgent mail.
- `.env.example` no longer enables 15s notification/auto-processing intervals by default; they are documented as local-testing overrides.

## Validation Evidence

- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/bff run build` passed.
- Restarted BFF from `apps/bff/dist/server.js`.
- `GET http://127.0.0.1:8787/health` returned `ok=true`, `prisma.ok=true`, `llm.ok=true`, `mailPrivacy.ok=true`, `microsoft.ok=true`, `google.ok=true`.
- Authenticated Outlook notification poll returned `ok=true`, `urgent.totalUrgentImportant=12`, `urgent.newItems.length=3`.
- Authenticated Gmail notification poll returned `ok=true`, `urgent.totalUrgentImportant=3`, `urgent.newItems.length=3`.
- SSE stream `GET /api/mail/notifications/stream` emitted a `notification` event with `ok=true`; `curl --max-time` ended with the expected timeout after receiving stream data.
- `git diff --check -- apps/bff/src/server.ts apps/bff/src/google-gmail.ts apps/bff/.env.example` passed.

## Independent Audit Rounds

### Round 1

Result: no Critical/High.

Findings:
- Medium: cold/manual notification polls could suppress fresh heuristic-urgent mail until KB processing catches up.
- Medium: Gmail metadata partial failures were dropped when at least one chunk item succeeded, risking incomplete `ok` notification results.
- Low: `.env.example` enabled active 15s polling intervals, which could be copied into non-local deployments.

Resolution:
- Added realtime urgent fallback candidates for fresh unprocessed raw urgent mail.
- Made Gmail metadata partial failure fail closed with a retryable provider error.
- Commented out 15s interval overrides in `.env.example`.

### Round 2

Result: no Critical/High.

Findings:
- Medium: transient realtime urgent candidates were appended after KB urgent items and could still be sliced out when 20 KB urgent items already existed.

Resolution:
- Ordered transient realtime urgent candidates before KB-aligned urgent items before slicing to 20.

### Round 3

Result: no unresolved Critical/High/Medium/Low findings.

## Final Status

Clean. No deferred findings.
