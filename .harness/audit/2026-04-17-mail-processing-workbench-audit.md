# New Mail Processing Workbench Audit

Timestamp: 2026-04-17T23:41:15+08:00

Task type: Code

Scope:
- `apps/bff/src/server.ts`
- `packages/shared-types/src/index.ts`
- `apps/webui/src/contexts/MailContext.tsx`
- `apps/webui/src/components/dashboard/InboxView.tsx`
- `apps/webui/e2e/smoke.spec.ts`

Initial audit:
- Agent: Ohm (`019d9c14-abbf-73b3-825c-bbff624cabe3`)
- Tool/model: sub-agent, `gpt-5.4-mini`, reasoning `medium`
- Findings:
  - High: a successful processing click triggered the new aggregate API and then fetched triage/insights again, multiplying real mailbox reads.
  - Medium: if later processing stages failed after KB update, the endpoint returned an error instead of preserving partial results.
  - Medium: processing results were not cleared on source switch or failed runs.
  - Low: the new workbench should treat `/api/mail/processing/run` as the UI data source instead of re-composing existing routes twice.

Fixes after initial audit:
- Removed the post-processing `fetchTriage()` / `fetchInsights()` calls from `InboxView`.
- Added `status` and `warnings` to `MailProcessingRunResult`.
- Made `/api/mail/processing/run` keep successful KB results and return `partial` results when notification, triage fallback, or insights stages fail.
- Reused notification-poll triage counts instead of fetching triage again on the happy path.
- Cleared `processingResult` when processing starts, when processing fails, and when the active source changes.
- Added partial-result warning display in the Inbox workbench.

Final audit:
- Agent: Hume (`019d9c19-beb7-7550-a57d-cedd465cf06c`)
- Tool/model: sub-agent, `gpt-5.4-mini`, reasoning `low`
- Result: Critical `0`, High `0`, Medium `0`, Low `0`.
- Final status: deliverable.

Validation:
- `npm --workspace apps/webui run check` passed.
- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/webui run build` passed.
- `npm --workspace apps/bff run build` passed.
- `npm run harness:smoke` passed with `7/7`.
- `git diff --check` passed.
- `npm run check:standard` passed with `HARNESS_STANDARD_OK`.
