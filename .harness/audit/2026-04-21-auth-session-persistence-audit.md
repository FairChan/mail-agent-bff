# 2026-04-21 Auth Session Persistence Audit

- Scope:
  - `/Users/fairchan/Desktop/mail-agent-bff/apps/bff/src/server.ts`
  - Auth-session persistence and recovery across Redis + Prisma, including logout, revocation, `/api/mail` + `/api/agent` preHandler hydration, and `/api/auth/preferences`
- Validation:
  - `npm --workspace apps/bff run check`
  - `npm --workspace apps/bff run build`
  - `npm run harness:semantic`
  - `git diff --check -- apps/bff/src/server.ts`
  - `curl -sS http://127.0.0.1:8787/health`
  - authenticated `POST /api/auth/login`
  - authenticated `GET /api/auth/session`
  - authenticated `POST /api/auth/logout`
  - authenticated `GET /api/auth/session` after logout
  - sequential restart proof completed in-session: login -> authenticated -> restart BFF -> authenticated -> logout -> unauthenticated

## Audit Phase 1

- Auditor: `Leibniz`
- Result:
  - High: logout persistence order allowed resurrection if Prisma delete ran before Redis tombstone.
  - Medium: request-path tenant hydration still depended on in-memory auth state.
  - High: cached-session early return could miss revocation state.
  - High: fire-and-forget persistence could race with logout and replay stale state.
- Action:
  - Added per-token persistence queue.
  - Wired request-path auth + mail-source hydration into `/api/mail` and `/api/agent`.
  - Enforced Redis tombstone before Prisma delete.

## Audit Phase 2

- Auditors: `Halley`, `Hilbert`
- Result:
  - High: non-strict cleanup still left a durable Prisma session when Redis tombstone write failed.
  - High: Redis tombstone/load errors were treated like cache misses and could fall back to Prisma.
  - High: `strict: true` logout still short-circuited before Prisma cleanup when Redis tombstone write failed.
- Action:
  - Added `AuthSessionStoreUnavailableError` and fail-closed handling for Redis revocation/hydration failures.
  - Added Prisma-backed cross-check before trusting Redis-hydrated sessions.
  - Changed cleanup to continue Prisma deletion even when Redis tombstone persistence fails, including strict logout.

## Audit Phase 3

- Auditor: `Euler`
- Final result:
  - No `Critical` findings.
  - No `High` findings.
  - One `Medium` finding remains:
    - A narrow Redis-before-Prisma crash window on session creation/refresh can cause a fresh Redis session to be treated as stale on first recovery request if the process dies after Redis save but before Prisma upsert.

## Deferred Medium

- Finding:
  - Redis hit with missing Prisma row can currently be purged during recovery if the process crashes in the narrow window after Redis save and before Prisma upsert.
- Rationale:
  - The current local deployment runs with `REDIS_AUTH_SESSIONS_ENABLED=false`, so this path is dormant locally.
  - Fixing it correctly needs a dedicated cross-store activation protocol or versioning design so the system can distinguish "fresh session not yet committed to Prisma" from "stale Redis residue after logout" without reopening the revocation hole that was just closed.
- Owner: Codex
- Target date: `2026-04-23`

## Final Status

- `Critical`: 0 unresolved
- `High`: 0 unresolved
- `Medium`: 1 deferred with rationale, owner, and target date
- `Low`: 0 noted in final pass
