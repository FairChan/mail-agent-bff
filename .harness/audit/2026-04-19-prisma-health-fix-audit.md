# 2026-04-19 Prisma Health Fix Audit

- Task: Fix local BFF `/health` Prisma readiness (`prisma.ok=false`) by bringing up a real local PostgreSQL instance, wiring Prisma env, and making local DB bootstrap work on macOS.
- Timestamp: `2026-04-19T21:01:54+08:00`
- Scope reviewed:
  - `/Users/fairchan/Desktop/mail-agent-bff/scripts/ensure-local-postgres.mjs`
  - `/Users/fairchan/Desktop/mail-agent-bff/package.json`

## Independent Audit Evidence

- Attempt 0:
  - Tool/model: `spawn_agent` explorer (`Plato`)
  - Result: failed before review due agent usage-limit error from the platform.

- Round 1:
  - Tool/model: external independent review via SiliconFlow `Pro/zai-org/GLM-5.1`
  - Output file: `/Users/fairchan/Desktop/mail-agent-bff/.harness/tmp/prisma-health-audit-round1.txt`
  - Result: non-actionable because the prompt only included the entrypoint diff and the reviewer said the new script body was missing.

- Round 2:
  - Tool/model: external independent review via SiliconFlow `Pro/zai-org/GLM-5.1`
  - Output file: `/Users/fairchan/Desktop/mail-agent-bff/.harness/tmp/prisma-health-audit-round2.txt`
  - Findings returned:
    - High: admin `psql` bootstrap path could target the wrong instance / auth mode.
    - Medium: password was exposed in process args via `-qc`.
    - Medium: malformed percent-encoding in `DATABASE_URL` could throw raw `URIError`.
    - Low: inline `.env` comments were not stripped.
    - Low: `export ` prefix in `.env` was not handled.

- Round 3:
  - Tool/model: external independent review via SiliconFlow `Pro/zai-org/GLM-5.1`
  - Result: timed out at 30s during final re-review after fixes; no usable verdict was returned.

## Fixes Applied After Audit

- Prefer TCP admin bootstrap args with `-h` + `-p`, then fall back to socket mode only when local admin TCP auth fails.
- Verify the admin connection resolves to the expected PostgreSQL port before mutating roles/databases.
- Pipe role SQL through stdin (`-f -`) so the generated password is not exposed in process args.
- Wrap `decodeURIComponent` in a safe helper that fails with a clear `DATABASE_URL` message.
- Extend the inline `.env` parser to handle `export KEY=...` and strip unquoted inline comments.
- Keep the root `db:ensure-local` entry cross-platform by routing through the new Node bootstrap script instead of PowerShell-only startup.

## Post-Fix Verification

- `npm run db:ensure-local`
- `npm run db:migrate:deploy`
- `npm run db:migrate:status`
- `npm --workspace apps/bff run build`
- `npm --workspace apps/bff run check`
- `npm run harness:semantic`
- `curl -sS http://127.0.0.1:8787/health`
- `curl -sS http://127.0.0.1:8787/ready`
- `PGPASSWORD=*** /opt/homebrew/opt/postgresql@15/bin/psql -h 127.0.0.1 -p 5432 -U mery -d mery -Atqc "SELECT current_database(), current_user"`

## Deterministic Post-Fix Audit Check

- Tool: standalone Node verification process
- Output file: `/Users/fairchan/Desktop/mail-agent-bff/.harness/tmp/prisma-health-audit-invariants.txt`
- Result: clean
- Assertions covered:
  - `package.json` points `db:ensure-local` at the Node bootstrap script.
  - safe percent-decoding guard exists.
  - admin bootstrap prefers host+port and contains explicit socket fallback.
  - admin probe validates the expected port.
  - password-bearing SQL is piped through stdin instead of command args.
  - `.env` parsing handles `export ` and unquoted inline comments.

## Final Audit Status

- No unresolved `Critical` or `High` findings remain from the completed independent external audit round.
- The external final re-review timed out, but the audit-driven fixes were validated by rerunning the relevant commands and by a clean deterministic invariant check over the reviewed files.
