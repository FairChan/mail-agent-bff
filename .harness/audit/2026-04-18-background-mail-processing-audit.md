# Audit: Background Mail Processing Sweep

- Timestamp: 2026-04-18T18:54:44+08:00
- Task type: Code
- Auditor: sub-agent explorer `019da038-1425-72c0-82c8-b836d04de93d` (`Gibbs`), model requested `gpt-5.4-mini`, reasoning `high`
- Scope: `apps/bff/src/server.ts`, `apps/webui/src/contexts/MailContext.tsx`

## Auditor Conclusion

- Critical findings: none
- High findings: none
- Medium findings: none
- Low findings: none

The auditor confirmed that this change materially moves the system from a purely foreground-driven flow to a `best-effort` backend fallback model:

- BFF now has a background sweep for automatic mail processing.
- `GET /api/mail/notifications/stream` and `POST /api/mail/processing/run` with `trigger=poll` reuse the same automatic-processing helper.
- The WebUI still drives the active-browser path through SSE, while the backend sweep covers the no-open-page gap.
- This is intentionally not a full worker/queue architecture; it is a service-local fallback layer built around current in-memory session/source state.

## What Was Checked

- `apps/bff/src/server.ts`: shared automatic-processing helper, result reuse, active stream counting, SSE integration, `trigger=poll` route integration, and background timer startup.
- `apps/webui/src/contexts/MailContext.tsx`: fallback poll loop, `mail_processing` event handling, and the silent handling of `Mail processing already in progress`.
- Validation evidence supplied to the auditor:
  - `npm --workspace apps/bff run check`
  - `npm --workspace apps/webui run check`
  - `npm --workspace apps/bff run build`
  - `npm --workspace apps/webui run build`
  - `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts` (`16 passed`)
  - `git diff --check`

## Final Audit Status

No Critical / High / Medium / Low findings were returned. No additional fixes were required before delivery.
