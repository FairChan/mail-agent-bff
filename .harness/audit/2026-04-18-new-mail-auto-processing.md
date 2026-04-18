# Audit: New Mail Auto Processing

- Timestamp: 2026-04-18T18:01:58+08:00
- Task type: Code
- Auditor: sub-agent explorer `019d9ff1-7e39-7cd2-af9e-de4e335ce871` (`Hume`), model requested `gpt-5.4-mini`, reasoning `high`
- Scope: automatic new-mail processing after Outlook connection, knowledge-base persistence, calendar sync, urgent popup delivery, fallback polling, and related frontend smoke coverage.

## Auditor Output

Critical findings: none.

High findings:

1. `apps/webui/src/contexts/MailContext.tsx`: SSE fallback only polled once and did not enter the automatic preprocessing loop. If `EventSource` was unavailable or broke, the UI would stop checking for new mail after one silent notification poll, and `/api/mail/notifications/poll` did not invoke the new-mail preprocessing pipeline.

Low findings:

1. `apps/webui/src/components/notification/UrgentMailToast.tsx`: manual processing results intentionally skip the lower-left urgent toast. This remains accepted because the popup is designed for proactive automatic delivery; manual runs already surface urgent results in the processing workbench.

Auditor acceptance summary: the KB structure, scoring, event clustering, sender profiles, exported documents, four-quadrant triage, calendar draft flow, and automatic SSE-path urgent popup were present. The fallback polling gap had to be fixed before delivery.

## Fixes After Audit

- Added `trigger` and `windowDays` support to `POST /api/mail/processing/run`, allowing frontend fallback runs to call the same pipeline as an automatic `poll` trigger.
- Added frontend fallback automatic processing loop for browsers without `EventSource` or with a broken realtime stream.
- Kept source guards around fallback processing so stale mailbox results are ignored after switching sources.
- Added a Playwright smoke test proving the fallback path shows the urgent lower-left popup.

## Validation After Fix

- `npm --workspace packages/shared-types run typecheck`: passed
- `npm --workspace apps/bff run check`: passed
- `npm --workspace apps/webui run check`: passed
- `npm --workspace apps/bff run build`: passed
- `npm --workspace apps/webui run build`: passed
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts`: 16 passed
- `git diff --check`: passed

Final audit status: Critical none, High fixed, Low accepted as product behavior.
