# Active WebUI Inbox Bento Migration Audit - 2026-04-19

## Scope

- Continued the large active WebUI migration by redesigning the Inbox/New Mail Processing page as a bento-style workbench.
- Preserved the existing Outlook, mail processing, knowledge-base, calendar confirmation, notification, semantic search, and Agent Window flows.
- Added calendar-draft identity hardening and mailbox-source stale-response guards discovered during audit.
- Audited changed files:
  - `apps/webui/src/components/ui/Bento.tsx`
  - `apps/webui/src/components/dashboard/InboxView.tsx`
  - `apps/webui/src/contexts/MailContext.tsx`
  - `apps/webui/e2e/smoke.spec.ts`

## Validation

- `npm --workspace apps/webui run check` passed.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 -g "same-message calendar drafts|new-mail processing workbench"` passed with `2 passed` before the source-isolation fixes.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 -g "stale mail results|same-message calendar drafts|new-mail processing workbench"` passed with `3 passed` after the first source-isolation fix.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 -g "stale manual processing|stale mail results|same-message calendar drafts|new-mail processing workbench"` passed with `4 passed` after the manual-processing source guard.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1` passed with `25 passed`.
- `npm --workspace apps/webui run build` passed.
- `git diff --check` passed.
- `npm run harness:semantic` passed with `HARNESS_SEMANTIC_OK`; it reported existing backend safe-parse warnings outside this WebUI migration scope.

## Audit Rounds

### Round 1

- Tool/model: Codex sub-agent explorer `Euler` (`019da4f6-c78b-74c3-a2ba-a338d482c938`), model not surfaced by tool.
- Timestamp: `2026-04-19T16:20:00+08:00` local thread time.
- Findings:
  - `Medium`: calendar sync state was keyed only by `messageId`, so multiple calendar drafts from one email could become unconfirmable after the first sync.
  - `Medium`: switching mailbox sources cleared notification/KB state but could leave inbox triage and insights from the previous source visible under the new source.
  - `Low`: `BentoPanel` used `overflow-hidden`, which could clip focus rings and shadows.
- Fixes:
  - Keyed calendar draft sync state by `messageId:type:dueAt` and normalized server sync responses to the frontend canonical key.
  - Cleared inbox, triage, insights, and selected mail when the source changes.
  - Removed forced overflow clipping from `BentoPanel`.
  - Added smoke coverage for same-message multiple calendar drafts.

### Round 2

- Tool/model: Codex sub-agent explorer `Euler` (`019da4f6-c78b-74c3-a2ba-a338d482c938`), model not surfaced by tool.
- Timestamp: `2026-04-19T16:54:00+08:00` local thread time.
- Findings:
  - `Medium`: source switch reset did not clear stale mail `error`, so a previous mailbox error could keep the next mailbox on `ErrorDisplay`.
  - `Medium`: `fetchTriage` and `fetchInsights` did not discard late old-source responses after a source switch.
- Fixes:
  - Source switching now clears mail errors, mail loading state, detail loading state, and processing state.
  - `fetchInbox`, `fetchTriage`, and `fetchInsights` capture the requested source and drop success/error results if the active source changed.
  - `fetchSources` and `selectSource` update `activeSourceIdRef` before dispatching source changes.
  - Added smoke coverage for delayed stale triage responses after switching sources.

### Round 3

- Tool/model: Codex sub-agent explorer `Euler` (`019da4f6-c78b-74c3-a2ba-a338d482c938`), model not surfaced by tool.
- Timestamp: `2026-04-19T17:04:00+08:00` local thread time.
- Findings:
  - `Medium`: manual `runMailProcessing` could still commit a stale processing result after a mailbox source switch.
- Fixes:
  - `runMailProcessing` now captures the requested source, sends that source to the BFF, and drops late success/error results if the active source changed.
  - Added smoke coverage for delayed stale manual-processing results after switching sources.

## Final Status

- All Critical findings: none.
- All High findings: none.
- All Medium findings: fixed.
- Low findings: fixed.
- Final audit status: all findings returned within the three-round audit cap were fixed, and final validation passed after the Round 3 fix. No fourth sub-agent audit was run because this workspace caps sub-agent audits at three rounds per task.
