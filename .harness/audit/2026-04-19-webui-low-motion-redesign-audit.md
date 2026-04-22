# 2026-04-19 WebUI Low-Motion Redesign Audit

## Scope

- `apps/webui/src/components/ui/Calm.tsx`
- `apps/webui/src/components/layout/AppDock.tsx`
- `apps/webui/src/components/ui/AnimatedThemeToggle.tsx`
- `apps/webui/src/styles.css`
- `apps/webui/src/components/shared/LoadingState.tsx`
- `apps/webui/src/components/shared/LoadingSkeleton.tsx`
- `apps/webui/src/components/ui/Bento.tsx`
- `apps/webui/src/components/layout/WorkspaceWindow.tsx`
- `apps/webui/src/components/layout/Sidebar.tsx`
- `apps/webui/src/components/layout/SidebarDrawer.tsx`
- `apps/webui/src/components/layout/BottomNav.tsx`
- `apps/webui/src/components/notification/UrgentMailToast.tsx`
- `apps/webui/src/components/dashboard/MailKBSummaryModal.tsx`
- `apps/webui/src/components/dashboard/TutorialView.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/ArtifactsLibraryPanel.tsx`
- `apps/webui/package.json`
- `package-lock.json`

## Implementer Validation

- `npm --workspace apps/webui run check`
- `npm --workspace apps/webui run build`
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 --grep "shows lower-left urgent toast|falls back to automatic processing|renders the Eisenhower matrix"` (`4 passed`)
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1` (`26 passed`)
- `curl -I http://127.0.0.1:4173/` returned `HTTP/1.1 200 OK`
- `git diff --check`
- `rg -n '"motion"|motion/react|animate-pulse|animate-ping' apps/webui/src apps/webui/package.json package-lock.json` returned no matches

## Audit Round 1

- Tool / model: `codex exec review --uncommitted --ephemeral -m gpt-5.4-mini`
- Session id: `019da66d-8543-72f3-9b56-54fa1b66e5da`
- Timestamp: `2026-04-19T23:48:08+08:00` approx.
- Findings:
- `P3`: Desktop dock did not mark the `knowledgebase` view alias active when opened from the KB completion modal.
- `P3`: Tutorial hero mailbox badge used `activeSource` instead of `activeSource.ready`, so a verifying source could appear ready.
- `P3`: Opening KB results from the tutorial modal still triggered tutorial refresh work after navigating away.

## Audit Round 2

- Tool / model: `codex exec --skip-git-repo-check --ephemeral -m gpt-5.4-mini`
- Session id: `019da66f-f3da-7723-b875-1fc2c8db81a4`
- Timestamp: `2026-04-19T23:50:48+08:00` approx.
- Findings:
- `Medium`: `MailKBSummaryModal` had `role="dialog"`/`aria-modal="true"` but lacked `aria-labelledby`/`aria-label`, Escape close handling, and focus trapping.
- `Low`: Desktop dock alias active-state issue for `knowledgebase` was confirmed independently; this overlapped with Round 1 and was already fixed.

## Fixes

- `AppDock` now treats `currentView === "knowledgebase"` as active for the Stats/Knowledge dock item.
- `TutorialView` now gates the hero mailbox badge on `activeSource.ready`.
- `MailKBSummaryModal` now supports `onClose({ refresh: false })` so the tutorial can navigate to KB results without firing refreshes after unmount.
- `MailKBSummaryModal` now wires `aria-labelledby`, Escape close handling, focus trapping, and focus restoration.
- `UrgentMailToast` now preserves semantic `<section>` toast containers required by existing smoke expectations.
- `ArtifactsLibraryPanel` restored the Chinese heading `本地总结文档` for existing knowledge-base smoke coverage.

## Final Status

- All `Critical`, `High`, `Medium`, and `Low` findings returned by independent audit were fixed.
- Final validation passed after the audit-driven fixes.
- No unresolved audit finding remains from the completed audit rounds.
