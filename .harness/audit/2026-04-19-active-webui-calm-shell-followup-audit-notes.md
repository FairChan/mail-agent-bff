# 2026-04-19 Active WebUI Calm Shell Follow-up Audit Notes

## Scope

- `apps/webui/src/components/dashboard/MailKBSummaryModal.tsx`
- `apps/webui/src/components/dashboard/StatsView.tsx`
- `apps/webui/src/components/dashboard/TutorialView.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/ArtifactsLibraryPanel.tsx`
- `apps/webui/src/components/layout/BottomNav.tsx`
- `apps/webui/src/components/layout/SidebarDrawer.tsx`
- `apps/webui/src/components/shared/LoadingState.tsx`
- `apps/webui/src/components/shared/LoadingSkeleton.tsx`

## Validation Run By Implementer

- `npm --workspace apps/webui run check`
- `npm --workspace apps/webui run build`
- `curl -I http://127.0.0.1:4173/`
- `git diff --check` on touched files

## Round 1

- Tool / model: `codex exec review --uncommitted --ephemeral -m gpt-5.4-mini`
- Output target: `.harness/audit/2026-04-19-active-webui-calm-shell-followup-audit-round1.md`
- Result: blocked before audit completed
- Evidence:
  - isolated `CODEX_HOME` run failed with `401 Unauthorized` and wrote an empty output file
  - no review findings were produced

## Round 2

- Tool / model: `codex exec review --uncommitted --ephemeral -m gpt-5.4-mini`
- Session id: `019da5fd-c43d-7e70-ac94-4a95b5dbe38d`
- Result: streamed review progressed, but no final artifact was emitted because the local Codex CLI/runtime kept hanging after repeated state-db discrepancy warnings
- Concrete finding observed in streamed reviewer output:
  - Mobile drawer layout regression risk in `apps/webui/src/components/layout/SidebarDrawer.tsx`: the refactor moved the drawer shell to `CalmSurface`, but the inner body still relied on `flex-1`; since `CalmSurface` is not `display:flex` by default, the content region could stop stretching/scrolling correctly on mobile
- Resolution:
  - Fixed by changing the drawer shell to `className="flex h-full flex-col ..."`
  - Re-ran `npm --workspace apps/webui run check` and `npm --workspace apps/webui run build` successfully after the fix

## Round 3

- Tool / model: `codex exec -C /tmp --skip-git-repo-check --ephemeral -m gpt-5.4-mini`
- Output target: `.harness/audit/2026-04-19-active-webui-calm-shell-followup-audit-round3.md`
- Input mode: diff-only prompt from `/tmp/webui-calm-followup.diff`
- Result: reviewer started and inspected the diff, but again stalled before emitting a final artifact
- Evidence:
  - no additional concrete findings surfaced in streamed output before interruption
  - output artifact was not finalized due local Codex CLI/runtime instability

## Final Audit Status

- Resolved findings: 1 externally surfaced layout-risk finding from Round 2, fixed and revalidated
- Unresolved `Critical` findings: none observed
- Unresolved `High` findings: none observed
- Clean final external artifact: blocked by local Codex CLI/runtime instability (`state_5.sqlite` migration discrepancy plus hanging review sessions)
