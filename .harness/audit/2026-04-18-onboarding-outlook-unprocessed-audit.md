# 2026-04-18 Onboarding / Outlook / Unprocessed Audit

- Timestamp: `2026-04-18T15:09:23+08:00`
- Task type: `Code`
- Scope:
  - `apps/bff/.env`
  - `apps/bff/src/server.ts`
  - `apps/bff/src/summary.ts`
  - `apps/bff/src/knowledge-base-service.ts`
  - `apps/bff/src/agent/mail-skills.ts`
  - `apps/bff/src/mail-kb-store.ts`
  - `apps/bff/src/mail.ts`
  - `apps/bff/src/routes/knowledge-base.ts`
  - `apps/webui/src/App.tsx`
  - `apps/webui/src/contexts/MailContext.tsx`
  - `apps/webui/src/components/dashboard/TutorialView.tsx`
  - `apps/webui/src/components/dashboard/MailKBSummaryModal.tsx`
  - `apps/webui/src/components/dashboard/InboxView.tsx`
  - `apps/webui/src/components/dashboard/SettingsView.tsx`
  - `apps/webui/src/components/dashboard/StatsView.tsx`
  - `apps/webui/src/components/dashboard/knowledgebase/EisenhowerMatrixPanel.tsx`
  - `apps/webui/src/components/dashboard/knowledgebase/KnowledgeBaseStatsCard.tsx`
  - `apps/webui/src/components/dashboard/knowledgebase/KnowledgeBaseView.tsx`
  - `apps/webui/src/components/dashboard/knowledgebase/quadrants.ts`
  - `apps/webui/src/components/agent/AgentWorkspaceWindow.tsx`
  - `apps/webui/e2e/smoke.spec.ts`
  - `packages/shared-types/src/index.ts`

## Initial independent audit

### Backend reviewer

- Reviewer: `McClintock`
- Agent id: `019d9f06-02bf-7513-bbc2-3bee697e8a3d`
- Tool/process: existing independent Codex sub-agent
- Initial output:
  - Reported one `High` finding claiming secret material was stored in tracked `apps/bff/.env`

### Frontend reviewer

- Reviewer: `Maxwell`
- Agent id: `019d9f06-031b-7802-ab18-a0516eb70658`
- Tool/process: existing independent Codex sub-agent
- Initial output:
  - `P2` Tutorial redirect only triggered from `currentView === "inbox"`
  - `P3` Smoke suite did not exercise the first-login tutorial flow

## Finding resolution

### Backend finding disposition

- Verified `apps/bff/.env` is git-ignored:
  - `apps/bff/.gitignore:8` -> `.env`
  - `git ls-files --error-unmatch apps/bff/.env` fails because the file is not tracked
- Result: initial backend finding was a false positive; no code change required.

### Frontend fixes applied

- Updated `apps/webui/src/App.tsx` so the tutorial auto-opens once per authenticated session after tutorial hydration, instead of only when the current view happened to be `inbox`.
- Expanded `apps/webui/e2e/smoke.spec.ts` with a dedicated first-login tutorial regression and mocked KB artifact/stat endpoints used by the tutorial page.

## Final audit status

- Backend re-audit (`McClintock`): `No findings`
- Frontend re-audit (`Maxwell`): `No findings`
- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`
- Final audit status: `pass`

## Validation rerun after audit-driven fixes

- `npm run test:e2e -- e2e/smoke.spec.ts` -> `11/11 passed`
- `npm run check:standard` -> `HARNESS_STANDARD_OK`
