# 2026-04-17 Agent Runtime Skill/Hook/Memory Audit

- Timestamp: `2026-04-17T18:13:59+08:00`
- Auditor: `Laplace` (`019d9a8d-e6b9-7092-884b-57188fdd9d39`), Codex sub-agent
- Scope:
  - `apps/bff/src/agent/mastra-runtime.ts`
  - `apps/bff/src/agent/mail-skills.ts`
  - `apps/bff/src/runtime/memory-store.ts`
  - `apps/bff/src/runtime/skill-registry.ts`
  - `apps/bff/src/server.ts`

## Audit Goal

Verify that the live Harness/Mastra runtime now:

1. loads local `skills/*/SKILL.md` skills in the active agent path,
2. wires hook + memory behavior into the active runtime,
3. keeps tenant/source isolation intact,
4. preserves mailbox access behavior while adding file-memory fallback.

## Validation Context Reviewed

- `npm --workspace apps/bff run check`
- `npm --workspace apps/bff run build`
- `git diff --check`
- `npm run harness:semantic`
- local runtime probe confirming:
  - local skill registry loads workspace skills,
  - `MastraRuntime.listSkills()` includes local skills,
  - file memory append/recall works,
  - `rememberPreference` falls back to file storage without Prisma.
- local API probe confirming:
  - `POST /api/mail/sources` can create a local in-memory Microsoft source,
  - `GET /api/agent/skills` includes local skill entries such as `email-reader`,
  - `POST /api/agent/memory` and `GET /api/agent/memory/recent` work through file storage.

## Findings

- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`

## Auditor Summary

- The live `MastraRuntime` is now connected to:
  - `getDefaultMemoryStore()` for file-backed memory,
  - `createDefaultHookEngine()` for hook execution,
  - `createSkillRegistry()` for workspace `skills/` discovery and prompt injection.
- `rememberPreference` now writes file memory first and treats the database as a best-effort mirror.
- `/api/agent/memory` and `/api/agent/memory/recent` now share the same file-backed primary store and merge database records when present.
- File memory remains scoped by `userId + sourceId`, so tenant/source isolation was preserved in this change.

## Residual Risk

- The design intentionally keeps a dual-write mirror (`file` primary, `database` mirror), so short-lived divergence between the two stores is still possible.
- The merged recent-memory response prefers file-memory ordering before database rows; it is a pragmatic merged view rather than a strict globally resorted timeline.
