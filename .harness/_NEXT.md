# Harness Next

## Current State

- Local Harness skeleton is being installed.
- Active goal: keep development checks local and avoid real mailbox/calendar side effects.
- Harness config checks pass: `npm run harness:mcp:check`, `npm run harness:semantic`, and targeted `npm run harness:verify`.
- L3 smoke command is wired as `npm run harness:smoke`.
- Full `npm run check:standard` is wired but currently red because the pre-existing product TypeScript baseline is red.

## Next Actions

1. Keep `.cursor/mcp.json` limited to local/no-secret MCP servers by default.
2. Enable optional MCP servers only after credentials are intentionally supplied.
3. Run `npm run check:standard` before commits.
4. Promote repeated failures from `.harness/error-journal.md` into `.harness/patterns-cache.json`.

## Known Red Baseline

- BFF `tsc` currently fails on existing drift in modular route files, config/env fields, and missing exports.
- WebUI `tsc -b` currently fails on existing component/type drift.
- `npm run harness:smoke` now runs real Playwright smoke and currently fails on existing WebUI runtime issues: title mismatch, `AuthScreen` reading undefined `brand`, and missing local BFF on `127.0.0.1:8787`.
- `npm audit --audit-level=high` reports 9 high vulnerabilities in current dependency graph (`argon2`/`tar`, `fastify`, `nodemailer`, `prisma`/`effect`).
- Owner: next product refactor implementer.
- Target: fix before treating `check:standard` as a required release gate.
