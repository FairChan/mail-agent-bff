# Daily Digest Schedule Audit

- Task type: Code
- Timestamp: 2026-04-21T23:26:37+08:00
- Implementer: Codex main session
- Audit tool/model: Codex sub-agent `McClintock`, `gpt-5.4-mini`, reasoning `high`
- Scope:
  - `apps/bff/src/notification-preferences-store.ts`
  - `apps/bff/src/server.ts`
  - `packages/shared-types/src/index.ts`
  - `apps/webui/src/components/dashboard/TutorialView.tsx`
  - `apps/webui/src/components/notification/NotificationCenter.tsx`
  - `apps/webui/src/components/layout/Header.tsx`
  - `apps/webui/e2e/smoke.spec.ts`

## Audit Result

Round 1 found no Critical, High, or Medium issues.

One Low issue was reported:

- `apps/webui/src/components/dashboard/TutorialView.tsx`: `handleSaveDailyDigest` could leave the previous success timestamp visible if a later save failed.

Resolution:

- Fixed by clearing `digestPrefsSavedAt` before saving and again in the failure branch.

Final status:

- No unresolved Critical/High findings.
- No unresolved Medium findings.
- Low finding fixed.

## Validation

- `npm --workspace packages/shared-types run typecheck` passed.
- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/bff run build` passed.
- `npm --workspace apps/webui run check` passed.
- `npm --workspace apps/webui run build` passed.
- `npm run harness:semantic` passed with existing warnings.
- `git diff --check` passed for touched files.
- Local authenticated API smoke passed:
  - saved a temporary daily digest time,
  - triggered `/api/mail/notifications/poll`,
  - confirmed `dailyDigest.summaryTitle`, `summaryLines`, `recommendedActions`, and `quietCount`,
  - restored original preferences,
  - restarted BFF and confirmed persisted preferences were loaded.
- Targeted Playwright passed:
  - `redirects first-time`
  - `saves notification preferences`
  - `renders urgent notifications`

## Known Non-Blocking Validation Note

`npm run check:standard` reached full Playwright and ended with 26/29 passing. The tutorial assertion introduced by this task was updated and its targeted test now passes. The two remaining failures are pre-existing/new-mail workbench UI smoke drift:

- `runs the new-mail processing workbench from the inbox`
- `keeps same-message calendar drafts independently syncable`

They do not block the daily digest schedule and notification path delivered in this task.
