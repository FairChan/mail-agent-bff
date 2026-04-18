# 2026-04-17 Agent Window Audit

- Timestamp: `2026-04-17T20:19:42+08:00`
- Task type: `Code`
- Scope:
  - `apps/webui/src/App.tsx`
  - `apps/webui/src/components/agent/AgentChatPanel.tsx`
  - `apps/webui/src/components/agent/AgentWorkspaceWindow.tsx`
  - `apps/webui/src/components/agent/useAgentConversation.ts`
  - `apps/webui/src/components/layout/Header.tsx`
  - `apps/webui/src/utils/agentWindow.ts`
  - `apps/webui/e2e/smoke.spec.ts`

## Implementation summary

- Added a standalone full-page agent workspace opened through `?window=agent`.
- Added shared agent conversation state with SSE parsing, thread persistence, cancel/reset, and tool activity tracking.
- Added header and floating-panel entrypoints so the user can open the standalone agent window from the main dashboard.
- Added mailbox-source selection, source verification, skills/capabilities loading, suggested prompts, and a persistent transcript area inside the standalone window.
- Expanded smoke coverage so the standalone agent window is exercised under mocked authenticated mailbox state.

## Audit round 1

### Auditor A

- Tool: `spawn_agent`
- Model: `session-inherited default sub-agent model`
- Agent: `Russell` (`019d9b03-eee8-7f82-9794-93ead1a48737`)
- Timestamp: `2026-04-17`
- Findings:
  - `Medium`: switching mailbox source or starting a new thread could leave stale draft text in the standalone window composer.
  - `Low`: the new smoke coverage was still too weak to prove the standalone window rendered under realistic authenticated state.

### Auditor B

- Tool: `spawn_agent`
- Model: `session-inherited default sub-agent model`
- Agent: `Galileo` (`019d9b09-75f2-7560-9ef8-d1e51ae77381`)
- Timestamp: `2026-04-17`
- Findings:
  - `Medium`: the shared SSE hook ignored `final.result.answer`, so a backend response with only a final event could leave the assistant bubble blank.
  - `Medium`: the standalone window smoke route did not yet prove the authenticated agent workspace path.
  - `Low`: the compact floating panel lost visible tool-progress feedback after the refactor.

## Audit-driven fixes

- Cleared standalone composer draft state on mailbox-source change and on explicit `New thread`.
- Added `hydrateAssistantFinal(...)` so final SSE answers backfill an empty assistant message.
- Restored compact-panel tool activity feedback using the shared `activities` stream.
- Strengthened Playwright smoke coverage by mocking authenticated session, mailbox source data, and agent skills for `/?window=agent`.

## Re-review

- Tool: `spawn_agent`
- Model: `session-inherited default sub-agent model`
- Agent: `Helmholtz` (`019d9b07-3702-76a2-af3c-d2cda04fd762`)
- Timestamp: `2026-04-17`
- Result:
  - Critical 0
  - High 0
  - Medium 0
  - Low 0

## Validation after fixes

- `npm --workspace apps/webui run build`
- `npm run harness:smoke`
- `git diff --check`

## Residual risk

- Playwright smoke now verifies the standalone window shell, authenticated provider wiring, and source selection state, but it still does not exercise a real end-to-end live SSE answer from the production BFF during browser automation.
