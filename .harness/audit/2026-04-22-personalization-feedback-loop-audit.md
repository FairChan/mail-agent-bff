# Personalization Feedback Loop Audit

- Task type: Code
- Workspace: `/Users/fairchan/Desktop/mail-agent-bff`
- Timestamp: `2026-04-22T01:45:21+08:00`
- Scope: behavior-driven personalization learning, manual quadrant overrides, local learning artifacts, and detail-surface feedback capture.

## Validation

- Passed: `rtk npm --workspace apps/bff run check`
- Passed: `rtk npm --workspace apps/webui run check`
- Passed: `rtk npm --workspace apps/bff run build`
- Passed: `rtk npm --workspace apps/webui run build`
- Passed: `rtk npm run harness:semantic`
- Passed: targeted `rtk git diff --check` for changed personalization files.
- Passed: `rtk npm run db:migrate:deploy` applied `202604221130_personalization_feedback_loop`.
- Passed: `rtk curl -s http://127.0.0.1:8787/health` returned `ok=true` with `prisma.ok=true`.
- Broader `rtk npm run check:standard` reached Playwright with 30/32 passing. The 2 failures are the existing new-mail processing workbench smoke drift around `立即处理新邮件`, already known outside this personalization task.

## Tooling Notes

- Two broad audit attempts (`Avicenna`, `Kuhn`) were stopped because they did not return output in a useful time window.
- The first successful audit was completed by sub-agent `Hegel`.
- The post-fix re-audit was completed by sub-agent `Peirce`.

## Round 1 Findings

Critical: none.

High:

1. `apps/bff/src/personalization-learning-store.ts` cleared manual overrides still wrote `manual_override` feedback, turning reset-to-auto into positive reinforcement.
2. `apps/webui/src/contexts/MailContext.tsx` emitted duplicate `knowledge_card_saved` feedback after the BFF route already recorded the same event.
3. `apps/webui/src/hooks/useDetailFeedbackSession.ts` flushed delayed detail feedback against the current active source, so switching mailboxes could write old-source feedback into the new source.

Medium:

1. `apps/bff/src/mail.ts` applied personalization once during `normalizeMessage` and again during `applyPersonalizationToTriageItems`, potentially double-amplifying learned/profile signals.

Low: none.

## Fixes

- Clearing a manual override now deletes the override and rebuilds learning state without creating a new `manual_override` event.
- Frontend knowledge-card save no longer emits duplicate feedback; the BFF remains the single recorder for that action.
- Detail feedback capture now binds to the source active when the detail session opens and sends that source explicitly on flush/action.
- Inbox normalization no longer passes the resolved personalization profile into `normalizeMessage`; personalization is applied once in `applyPersonalizationToTriageItems`.

## Round 2 Re-Audit

Sub-agent `Peirce` reviewed only the four fixed findings.

- Critical: no residual issues.
- High: no residual issues.
- Medium: no residual issues.
- Low: no residual issues.

Final status: no unresolved Critical, High, Medium, or Low findings for the audited personalization feedback-loop changes.
