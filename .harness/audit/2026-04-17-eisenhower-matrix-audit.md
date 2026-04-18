# Eisenhower Matrix Audit

Timestamp: 2026-04-17T23:27:32+08:00

Task type: Code

Scope:
- `apps/webui/src/components/dashboard/knowledgebase/EisenhowerMatrixPanel.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/quadrants.ts`
- `apps/webui/src/components/dashboard/knowledgebase/KnowledgeBaseStatsCard.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/MailsListPanel.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/KnowledgeBaseView.tsx`
- `apps/webui/e2e/smoke.spec.ts`
- `apps/bff/src/mail-kb-store.ts`
- `apps/bff/src/mail-kb-export.ts`
- `packages/shared-types/src/index.ts`

Initial audit:
- Agent: Heisenberg (`019d9c01-4496-7d70-97b9-98a62e39b32e`)
- Tool/model: sub-agent, `gpt-5.4-mini`, reasoning `medium`
- Findings:
  - High: unknown or invalid `mail.quadrant` could crash the matrix and mail list.
  - Medium: score scale was inferred only from raw numeric size and could mislabel legacy scores.
  - Low: mail list items used clickable `div` elements instead of keyboard-reachable controls.
  - Low: smoke coverage did not include unknown quadrants or legacy scores.

Fixes after initial audit:
- Added runtime quadrant normalization/fallback in WebUI matrix and mail-list rendering.
- Added BFF KB-store quadrant normalization for score indexes and statistics.
- Changed mail-list rows to real `button` controls.
- Added smoke coverage for an unknown quadrant plus legacy `1-10` score rendering.

Second audit:
- Agent: Chandrasekhar (`019d9c05-a1fc-7422-a070-243d2cbe601b`)
- Tool/model: sub-agent, `gpt-5.4-mini`, reasoning `medium`
- Findings:
  - Critical: 0
  - High: 0
  - Medium: legacy all-`<=1` scores could still be mislabeled as percentages.
  - Low: KB export score-index header still implied raw values were always `0-1`.

Fixes after second audit:
- Added optional shared `scoreScale` to KB mail records and score indexes.
- Made BFF KB-store read paths synthesize `scoreScale` for project-owned KB records.
- Made WebUI show raw values instead of percentages when `scoreScale` is missing and cannot be trusted.
- Updated KB score exports to include an explicit `分数制` column and formatted score values.

Final audit:
- Agent: Parfit (`019d9c0d-6ae4-7892-8793-5fc4ab610128`)
- Tool/model: sub-agent, `gpt-5.4-mini`, reasoning `low`
- Result: Critical `0`, High `0`, Medium `0`, Low `0`.
- Final status: deliverable.

Validation:
- `npm --workspace apps/webui run check` passed.
- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/webui run build` passed.
- `npm --workspace apps/bff run build` passed.
- `npm run harness:smoke` passed with `6/6`.
- `git diff --check` passed.
