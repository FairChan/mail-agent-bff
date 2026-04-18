# 2026-04-17 Mail KB History Audit

- Timestamp: `2026-04-17T21:51:50+08:00`
- Scope:
  - `apps/bff/src/server.ts`
  - `apps/bff/src/agent/mail-skills.ts`
  - `apps/bff/src/agent/mastra-runtime.ts`
  - `apps/bff/src/knowledge-base-service.ts`
  - `apps/bff/src/mail-kb-export.ts`
  - `apps/bff/src/mail-kb-store.ts`
  - `apps/bff/src/summary.ts`
  - `apps/webui/src/components/dashboard/MailKBSummaryModal.tsx`
  - `apps/webui/src/components/agent/AgentWorkspaceWindow.tsx`
  - `apps/webui/src/components/agent/useAgentConversation.ts`
  - `apps/webui/src/contexts/MailContext.tsx`
  - `apps/webui/src/components/dashboard/knowledgebase/KnowledgeBaseView.tsx`
  - `apps/webui/src/components/dashboard/knowledgebase/MailsListPanel.tsx`

## Initial sub-agent audit

- Backend auditor: `Beauvoir` (`019d9bac-8c00-77f1-9e8b-f25a53858e99`)
  - High:
    - `/api/mail-kb/export` could mark a partial KB as complete while a backfill job was still running.
  - Medium:
    - historical KB search was capped to newest 500 records.
    - KB export Markdown content was insufficiently sanitized.
  - Low:
    - export API leaked absolute file paths.
- Frontend auditor: `Socrates` (`019d9bac-8c21-7b52-91c5-60c1085c9993`)
  - Medium:
    - KB stats fetch was not pinned to the job source.
    - initial job snapshot fetch and SSE updates could overwrite or duplicate each other.
  - Low:
    - score display did not preserve the legacy 1-10 scale.

## Fixes applied

- Blocked `/api/mail-kb/export` while a KB job is `pending` or `running`.
- Changed KB export completion metadata so only completed backfills mark `backfillCompleted=true`.
- Removed absolute file-path leakage from the export API response.
- Expanded historical KB search to scan the full persisted KB instead of only the newest 500 items.
- Sanitized Markdown-exported text for subjects, summaries, event content, and sender profiles.
- Pinned KB stats fetches in the modal to the job's `sourceId`.
- Added log reconciliation/merge logic so snapshot fetches and SSE updates no longer stomp each other.
- Restored backward-compatible score rendering for both `0-1` and legacy `1-10` records.

## Re-audit

- Frontend re-auditor: `Volta` (`019d9bb3-067c-77c1-a276-d92ed921186b`)
  - No Critical/High findings.
  - One Low finding remained for missing `error` phase badge mapping.
- Backend re-auditor: `Galileo` (`019d9bb3-064f-7160-b924-afe35acee8a4`)
  - No Critical/High findings.
  - One Medium finding remained for stale `existingEvents` / `existingSenders` snapshots across batches.

## Final fixes after re-audit

- Added explicit `error` phase label/badge mapping in `MailKBSummaryModal`.
- Refreshed existing event/sender context at the start of every analysis batch so later batches can reuse entities created by earlier batches.

## Validation

- `npm --workspace apps/bff run check`
- `npm --workspace apps/webui run check`
- `npm --workspace apps/bff run build`
- `npm --workspace apps/webui run build`
- `npm run harness:smoke`
- `git diff --check`

## Final audit status

- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`
