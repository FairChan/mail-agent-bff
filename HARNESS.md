# Harness Development Environment

This workspace uses a local Harness scaffold to keep AI-assisted development testable, recoverable, and isolated from real mailbox/calendar side effects.

## Current Layers

- Layer 1 hooks: implemented as local scripts and Cursor hook templates.
- Layer 3 skills: `suggesting-cursor-hooks` and `suggesting-cursor-rules` are installed as local skills.
- Layer 4 verification: `check:standard` runs the initial standard gate.
- Layer 5 knowledge: `.harness/error-journal.md`, `.harness/patterns-cache.json`, `.harness/_NEXT.md`, `memory/`, and `MEMORY.md`.

## Commands

```bash
npm run harness:mcp:check
npm run harness:semantic
npm run harness:verify
npm run check:standard
```

Run a recoverable local API mock/traffic console:

```bash
npm run harness:mock
```

Run standalone MCP servers for local testing:

```bash
npm run harness:filesystem:mcp
npm run harness:playwright:mcp
npm run harness:smoke
```

## Active MCP Servers

Active by default in `.cursor/mcp.json`:

- `filesystem`: local workspace file access only.
- `playwright`: headless isolated browser automation with output under `.harness/tmp/playwright-mcp`.
- existing OpenClaw servers already present in this workspace.

Optional, credentialed, or external servers live in `.cursor/mcp.optional.json` and should be copied into the active config only after credentials are intentionally supplied:

- `github`
- `imap-mini`
- `agentops`
- `sentry`

Inspectr is started with `npm run harness:mock` instead of active Cursor MCP config because it is a local app/proxy and mock server.

## Safety Rules

- Do not use real school/work mailbox or calendar accounts for high-frequency tests.
- Prefer `.harness/fixtures/` and Inspectr/OpenAPI mocks.
- Do not write `.env`, force-push, or run destructive DB commands without explicit approval.
- Repeated failures should be logged in `.harness/error-journal.md` and promoted into `.harness/patterns-cache.json` only when they are real and recurring.

## Standard Gate

`npm run check:standard` currently runs:

- MCP config validation
- tenant check
- audit check
- state check
- RLS check
- storage check
- contracts check
- correction check
- invariants / semantic check
- workspace TypeScript checks
- Playwright smoke test (`apps/webui/e2e/smoke.spec.ts`)

Some domain checks are intentionally N/A until this app has the matching source of truth, such as Supabase RLS policies or storage bucket registry.

## Known Baseline Blockers

The standard gate is installed, but the existing product codebase is not yet green:

- BFF TypeScript currently fails on pre-existing route/config/export drift.
- WebUI TypeScript currently fails on pre-existing component/type drift.
- Real Playwright smoke currently runs and fails on pre-existing WebUI runtime issues: title mismatch, `AuthScreen` reading undefined `brand`, and missing local BFF on `127.0.0.1:8787`.
- `npm audit --audit-level=high` reports 9 high vulnerabilities in the current dependency graph.
- If an OpenClaw gateway token was ever committed, rotate it in the OpenClaw config and provide it through the local environment before starting Cursor.

Treat `harness:mcp:check`, `harness:semantic`, and targeted `harness:verify` as the green Harness setup checks until the product refactor clears the baseline.
