# Active WebUI Window And Dock Migration Audit - 2026-04-19

## Scope

- Migrated the active WebUI further toward the user-designed remote frontend without replacing working product flows.
- Added a bottom application dock and a unified workspace-window shell around the existing pages.
- Preserved Outlook direct auth, mail processing, knowledge-base views, tutorial onboarding, calendar, notification center, urgent toast, semantic search, and embedded/standalone Agent Window behavior.
- Audited changed files:
  - `apps/webui/src/App.tsx`
  - `apps/webui/src/components/layout/AppDock.tsx`
  - `apps/webui/src/components/layout/WorkspaceWindow.tsx`
  - `apps/webui/src/components/omnisearch/OmniSearchBar.tsx`
  - `apps/webui/src/components/notification/UrgentMailToast.tsx`
  - `apps/webui/e2e/smoke.spec.ts`

## Validation

- `npm --workspace apps/webui run check` passed.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 -g "migrated dock"` passed.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1 -g "migrated dock|urgent toast after automatic"` passed.
- `npm --workspace apps/webui run test:e2e -- e2e/smoke.spec.ts --workers=1` passed with `22 passed`.
- `npm --workspace apps/webui run build` passed.
- `git diff --check` passed.

## Audit Rounds

### Risk Exploration

- Tool/model: Codex sub-agent explorer `Pauli` (`019da48a-5d42-7932-926f-d3ba6ba5b419`), `gpt-5.4-mini`.
- Timestamp: `2026-04-19T15:00:00+08:00` local thread time.
- Result: Identified smoke selector, root shell, navigation, notification, and agent-window risk surfaces before final validation.

### Round 1

- Tool/model: Codex sub-agent explorer `Gauss` (`019da48e-7918-7713-9563-0fa9ca7f71fb`), `gpt-5.4-mini`.
- Timestamp: `2026-04-19T15:04:00+08:00` local thread time.
- Findings:
  - `High`: fixed dock could cover existing bottom overlays such as urgent toasts on narrow screens.
  - `Medium`: dock used tab semantics without full tab behavior and exposed cryptic `dock-*` accessible names.
  - `Low`: dock smoke coverage did not exercise overlay coexistence or keyboard/interaction risks.
- Fixes:
  - Lowered the dock layer to `z-30` so urgent toast, mail detail modal, and semantic-search modal remain above it.
  - Converted dock items from a pseudo-tablist into normal navigation buttons with `aria-current`.
  - Replaced cryptic accessible names with human-readable dock labels.
  - Added smoke coverage asserting urgent toast z-index stays above dock z-index.

### Round 2

- Tool/model: Codex sub-agent explorer `Gauss` (`019da48e-7918-7713-9563-0fa9ca7f71fb`), `gpt-5.4-mini`.
- Timestamp: `2026-04-19T15:07:00+08:00` local thread time.
- Result: `No findings`.

## Final Status

- All Critical findings: none.
- All High findings: fixed.
- All Medium findings: fixed.
- Low coverage issue: addressed with targeted smoke coverage.
- Final audit status: clean after Round 2.
