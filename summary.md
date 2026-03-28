# Project Summary

## Project Architecture

- Core docs: `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`.
- Memory layer: `memory/` stores dated notes and long-running policy/context files.
- Skill layer: `skills/<skill_name>/` stores reusable capabilities, each with `SKILL.md` and optional scripts/assets.
- Utility scripts: `get-google-token.sh`, `local-oauth-proxy.py` for local auth/tooling support.
- Runtime/meta folders: `.openclaw/`, `.clawhub/` and local logs like `davmail.log`.

### Email Agent Runtime (OpenClaw + Composio + Outlook)

- Gateway service: `openclaw-gateway` runs as a systemd user service and listens on `127.0.0.1:18789` (WS + HTTP multiplex).
- Core config path: `/root/.openclaw/openclaw.json` (`gateway.bind=loopback`, `gateway.auth.mode=token`, Control UI `allowedOrigins` configured).
- Plugin runtime: custom global plugins in `/root/.openclaw/extensions/`, including `composio` plugin loaded from `/root/.openclaw/extensions/composio/index.ts`.
- Composio integration path: OpenClaw plugin -> Composio MCP (`https://connect.composio.dev/mcp`) -> third-party app tools (including Outlook) exposed as OpenClaw tools.
- Tool discovery/execution model: plugin fetches `tools/list`, dynamically registers tool schemas, then executes via MCP `callTool`.
- Outlook connectivity status: Composio discovery context indicates Outlook is already manually connected and preferred for ambiguous intent.

## Standing Workflow Reference

- Source of truth for delivery workflow: `AGENTS.md` -> `Standing Delivery Requirements`.
- This file records architecture context and timestamped per-task updates.
- Use ISO-8601 timestamps in all new entries.

## Update Log

### 2026-03-25T10:28:26+08:00

- Added a permanent requirement to use a sub-agent for code audit before final delivery.
- Added a permanent requirement to integrate audit feedback into the final code.
- Created this `summary.md` document and initialized architecture + ongoing change-log sections.

### 2026-03-25T10:33:57+08:00

- Scope: Architecture review and planning only (no code changes).
- Main updates:
- Audited local OpenClaw layout: runtime at `/root/.openclaw`, workspace at `/root/.openclaw/workspace`, web app at `/root/web`.
- Verified Composio plugin is enabled and loaded, with Outlook connection active and usable tool chain.
- Reviewed current web app integration depth and identified which modules are live (gateway/auth/chat) vs placeholder (email/calendar/knowledge data plumbing).
- Produced a phased implementation plan for Outlook-based web email AI agent.
- Ran a sanitized Outlook sample analysis to ground planning in real mailbox patterns (high unread ratio, notification-heavy recent inbox, calendar APIs available).
- Confirmed a platform constraint: Outlook personal accounts do not support the enterprise search endpoint used by `OUTLOOK_SEARCH_MESSAGES`; semantic retrieval should rely on a local index pipeline.
- Sub-agent audit findings:
- Not applicable for this task (no source code implementation changes yet).
- Final fixes after audit:
- Not applicable.

### 2026-03-25T17:25:17+08:00

- Scope: Establish permanent execution rules for all upcoming tasks.
- Main changes:
- Added an enforceable `Standing Delivery Requirements` section in `AGENTS.md` as the workflow source of truth.
- Reworked workflow semantics with explicit `Code` / `Non-code` branching and non-code `Audit: N/A (no code changes)` handling.
- Added mandatory audit evidence fields: tool/model, timestamp, and output location.
- Added severity gate: all `Critical` / `High` findings must be fixed before delivery.
- Added post-fix re-validation requirement and blocked-delivery exception rule.
- Moved timestamp convention to ISO-8601 for machine-safe logs.
- Sub-agent audit findings:
- Audit evidence location: `/root/doc_audit`.
- Reported process issues: non-code scope ambiguity, undefined audit evidence, missing severity gate, missing re-validation step, duplicated policy source, unresolved `Pending` states, and ambiguous `CST` timestamp usage.
- Final fixes after audit:
- Implemented all `Critical` and `High` recommendations in `AGENTS.md`.
- Reduced policy drift by keeping workflow authority in `AGENTS.md` and leaving `summary.md` as a log + reference.
- Removed unresolved `Pending` markers from this entry and closed the loop within the same task.

### 2026-03-25T17:50:47+08:00

- Scope: Deep runtime investigation of local OpenClaw + Composio stack and frontend integration planning.
- Task type: `Non-code`
- Main changes:
- Re-verified live runtime state via CLI: gateway service status, bind mode, active port, RPC health, channel status, plugin loading, and tool catalog visibility.
- Confirmed local deployment topology: OpenClaw runtime under `/root/.openclaw`, workspace under `/root/.openclaw/workspace`, composio extension under `/root/.openclaw/extensions/composio`.
- Inspected Composio plugin source and config schema to map exact lifecycle: config parse -> tools/list bootstrap -> MCP transport connect -> dynamic tool registration -> prompt policy injection.
- Confirmed current Composio tool inventory and Outlook-connection hint in tool descriptions.
- Reviewed OpenClaw docs and protocol constraints relevant to web integration: WS `connect.challenge` handshake, Control UI origin policy, HTTP endpoints (`/tools/invoke`, optional `/v1/chat/completions`, optional `/v1/responses`) and security boundary.
- Updated architecture section in this file with a dedicated OpenClaw + Composio + Outlook runtime model.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit: N/A (no code changes)
- Final fixes after audit:
- Not applicable.

### 2026-03-25T18:25:52+08:00

- Scope: Implement M1 web stack (`webui + bff`) and connect OpenClaw backend to browser workflow.
- Task type: `Code`
- Main changes:
- Added workspace-level Node workspaces and project skeleton: `apps/bff` (Fastify + TypeScript) and `apps/webui` (React + Vite).
- Implemented BFF gateway integration for `GET /live`, `GET /ready` (`/health` alias), `POST /api/gateway/tools/invoke`, and `POST /api/agent/query`.
- Added secure BFF session flow: `POST /api/auth/login` (API key exchange), HttpOnly session cookie, `POST /api/auth/logout`, `/api/*` session guard, and login rate limiting.
- Tightened security defaults: loopback host default, timeout control for gateway calls, error/detail sanitization, and dependency-aware readiness status codes.
- Implemented WebUI control deck for runtime status, auth login/logout, tool invocation, and agent query debugging with cookie-based session auth.
- Added local run docs and env templates (`README.md`, `apps/bff/.env.example`, `apps/webui/.env.example`).
- Validation completed: `npm run check`, `npm run build`, and local curl integration tests for unauthorized/login/session/logout flow.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m1_code_audit`.
- Round 1 findings included `Critical`/`High`: missing BFF auth, `0.0.0.0` default bind, and overexposed error/internal details.
- Round 2 findings included one remaining `High`: browser-exposed shared API key model.
- Final audit round confirmed `Critical/High` are cleared after fixes.
- Final fixes after audit:
- Replaced browser `X-API-Key` mode with login-to-session model (HttpOnly cookie) and removed frontend-injected API key dependency.
- Added constant-time key comparison and login rate limiting to reduce brute-force risk.
- Changed BFF default listen host to loopback and kept cross-origin session flow constrained to configured origins.
- Normalized health semantics (`/live` + `/ready`) and sanitized upstream error leakage in API responses.
- Updated docs to clearly mark local/private deployment assumptions and production hardening items.

### 2026-03-25T19:00:39+08:00

- Scope: Implement M2 mail triage experience (four-quadrant inbox + message detail) on top of existing web stack.
- Task type: `Code`
- Main changes:
- Added BFF mail domain module with Outlook ingestion + triage pipeline in `apps/bff/src/mail.ts`.
- Added BFF APIs: `GET /api/mail/triage?limit=...` and `GET /api/mail/message?messageId=...`; removed path-style detail dependency to avoid special-character route failures.
- Added quadrant classification output model (`urgent_important`, `not_urgent_important`, `urgent_not_important`, `not_urgent_not_important`) and reason/score metadata for each message.
- Upgraded WebUI for M2:
- Added four-quadrant visualization board with refresh/limit controls.
- Added click-to-load message detail pane (sender/time/read/importance/body content).
- Added robust unauthorized-session cleanup and detail-request race protection (latest-only sequence gate).
- Expanded CSS for quadrant board, mail cards, detail view, and responsive behavior.
- Updated docs to M2 scope and new API contract.
- Validation completed:
- `npm run check` and `npm run build` passed.
- Runtime integration tested via curl: login -> triage -> message detail -> unauthorized on deprecated/invalid route.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m2_code_audit`.
- Round 1 reported 3 `High` issues: 401 state cleanup gap, detail request race, and silent-empty upstream parse risk.
- Final re-audit confirmed `Critical/High` are cleared after fixes.
- Remaining acceptable items (`Medium/Low`) deferred:
- Heuristic classifier can still misclassify nuanced content; owner: main implementer; target: M3 scoring+entity extraction enhancement.
- Runtime schema validation depth can be improved with stricter zod parsing at BFF/UI boundaries; owner: main implementer; target: M3 API hardening pass.
- Final fixes after audit:
- Added centralized `handleUnauthorized()` to clear sensitive UI state on session loss.
- Added detail request sequence guard to prevent stale response overwrite.
- Hardened Composio result parsing: strict tool slug/response/value validation with explicit failures.
- Switched detail API usage to query parameter form for message IDs containing reserved path characters.
- Updated README title/versioning and removed obsolete detail route reference.

## Update Entry Template

### YYYY-MM-DDTHH:MM:SS+08:00 - Task Title

- Scope:
- Task type: `Code` or `Non-code`
- Main changes:
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Final fixes after audit:

### 2026-03-25T19:29:00+08:00

- Scope: Implement M3 smart insights pipeline (timezone-aware extraction) and harden frontend/BFF race/security handling.
- Task type: `Code`
- Main changes:
- Added timezone-aware mail insights API path with extraction of DDL/meeting/exam signals and daily digest output.
- Extended BFF endpoint `GET /api/mail/insights` with optional `tz` query parameter and propagated this into extraction logic.
- Refactored date parsing and due-time construction in `apps/bff/src/mail.ts` to interpret relative/weekday/date hints in the requested timezone and convert to UTC instants safely.
- Fixed frontend auth-race leakage risk by adding request epoch gating for `meta/triage/insights` loads and stronger unauthorized cleanup.
- Updated WebUI to pass browser timezone to insights API and display backend timezone used for boundary decisions.
- Added safer external link rendering for message detail (`http/https` allowlist).
- Improved operational robustness:
- `/api/auth/logout` now bypasses auth guard to always clear session cookie.
- Session cookie now appends `Secure` in production mode.
- Added keyboard focus-visible styles for mail and timeline action rows.
- Updated README to M3 scope and documented insights timezone semantics.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed (`/api/mail/insights` unauthorized/login/authorized flows, timezone parameter behavior, logout without session).
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m2_code_audit`.
- Final re-audit status: `Critical=0`, `High=0`.
- Remaining deferred items (`Medium/Low`) with rationale:
- `Medium`: DST boundary handling for `horizonDays` still uses `now + 24h*N`; acceptable for current local pilot, owner: main implementer, target: M4 (`2026-03-31`).
- `Medium`: frontend API runtime schema validation (zod-safe parse) not yet added; acceptable for current controlled BFF contract, owner: main implementer, target: M4 (`2026-03-31`).
- `Low`: invalid `tz` currently falls back silently; acceptable with current UI-provided tz, owner: main implementer, target: M4 (`2026-03-31`).
- `Low`: `loginAttempts` map still lacks TTL/LRU pruning; acceptable at current traffic, owner: main implementer, target: M4 (`2026-03-31`).
- Final fixes after audit:
- Implemented request epoch protection in frontend to block stale response state rehydration after logout/session loss.
- Reworked timezone logic in BFF extraction so date parsing semantics and due instant construction are both `tz`-aware.
- Corrected weekday "next" parsing behavior to avoid accidental extra-week shift.
- Added production cookie hardening and logout cleanup behavior.

### 2026-03-25T20:53:24+08:00

- Scope: M4 hardening pass for API boundary correctness and defensive runtime validation.
- Task type: `Code`
- Main changes:
- Backend reliability hardening in `apps/bff/src/server.ts`:
- Added invalid IANA timezone validation for `/api/mail/insights` query (`tz`) with explicit `400` feedback.
- Added bounded in-memory protections for `sessions` and `loginAttempts` (size caps + periodic cleanup + write-time limit enforcement).
- Added proactive session purge on login/logout paths in addition to request-hook cleanup.
- Backend insights horizon semantics hardening in `apps/bff/src/mail.ts`:
- Updated `horizonDays` local-date window semantics to inclusive N-day range where day 1 is today in selected timezone.
- Removed DST-sensitive `now + 24h*N` window clipping for day-range inclusion logic.
- Frontend runtime contract hardening in `apps/webui/src/App.tsx`:
- Added zod runtime schema validation for meta/health/triage/insights/detail/tool-query envelopes.
- Tightened envelope validation to `ok === true` on success payloads.
- Added stricter field constraints (`datetime`, ranges for confidence/horizon/counts).
- Extended auth-epoch stale-response protection to tool invoke and agent query requests.
- Updated docs (`README.md`) to include invalid `tz` behavior and explicit `horizonDays` semantics.
- Added `zod` dependency to `apps/webui/package.json` for runtime validation.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed: login, insights success (`tz=America/Los_Angeles`), invalid `tz` returns `400`, logout-without-cookie returns `200`.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m4_code_audit`.
- Initial audit reported `High=2` (unbounded/weakly-cleaned `sessions` and `loginAttempts`).
- Applied fixes and re-audited: final status `Critical=0`, `High=0`.
- Remaining deferred items (`Medium/Low`) with rationale:
- `Medium`: DST rollback ambiguous local time may still require dual-candidate UTC resolution strategy in extreme cases; owner: main implementer; target: M5 (`2026-04-07`).
- `Medium`: reverse-proxy deployment should explicitly configure `trustProxy` and IP derivation policy; owner: main implementer; target: M5 (`2026-04-07`).
- `Low`: current map-limit eviction is FIFO, not activity-aware LRU; acceptable for current scale, owner: main implementer; target: M5 (`2026-04-07`).
- Final fixes after audit:
- Added fixed upper bounds and periodic maintenance for auth/session maps.
- Added proactive cleanup on login/logout code paths.
- Added explicit invalid-timezone rejection at API boundary.
- Added frontend runtime schema parsing and stricter success-envelope checks.

### 2026-03-25T21:14:24+08:00

- Scope: M5 production-hardening follow-up (proxy trust semantics, cache safety, DST ambiguity handling).
- Task type: `Code`
- Main changes:
- Fixed `TRUST_PROXY` parsing semantics in `apps/bff/src/config.ts`:
- `TRUST_PROXY=1` now parses to numeric hop count (`1`) instead of boolean `true`.
- Kept explicit boolean forms (`true/false/yes/no`) and comma-separated proxy allowlist support.
- Updated Fastify deployment guidance/docs:
- Clarified `.env.example` trust-proxy modes and cautioned against `true` on internet-facing deployment.
- Updated README quick-start note to prefer hop count / CIDR list for reverse proxy setup.
- Improved auth/session map robustness in `apps/bff/src/server.ts`:
- Added request-hot-path sweep throttling (`hotPathSweepIntervalMs`) to avoid full-map scans on every request.
- Retained periodic maintenance sweep and bounded map limits.
- Kept LRU-like behavior through `setLruEntry` + capped eviction.
- Improved DST fallback handling in `apps/bff/src/mail.ts`:
- Resolved local datetime to candidate UTC list and, when ambiguous, prefer later future candidate to avoid early trigger on fallback hour.
- Aligned internal horizon clamp semantics by removing `horizonDays || 7` fallback in `buildMailInsights` (default now single-sourced at API schema layer).
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed (login, insights with valid/invalid `tz`, readiness endpoint).
- Additional config validation check passed: `TRUST_PROXY=1` resolves to numeric `1`.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m5_code_audit`.
- Initial audit reported `High=1` (`TRUST_PROXY=1` parsed as `true`).
- Applied fixes and re-audited.
- Final audit status: `Critical=0`, `High=0`.
- Final fixes after audit:
- Corrected trust-proxy parsing to support numeric hop mode safely.
- Updated docs to prevent risky `true` trust-proxy defaults.
- Reduced hot-path cleanup overhead with sweep throttling.
- Finalized DST ambiguous candidate selection to prefer later future candidate.

### 2026-03-25T21:35:03+08:00

- Scope: M6 calendar-sync integration (insights -> Outlook event) with audit-driven hardening for duplicate-write and link-safety risks.
- Task type: `Code`
- Main changes:
- Added backend calendar sync capability:
- New endpoint `POST /api/mail/calendar/sync` in `apps/bff/src/server.ts`.
- Added `createCalendarEventFromInsight` flow in `apps/bff/src/mail.ts` using `COMPOSIO_MULTI_EXECUTE_TOOL -> OUTLOOK_CREATE_ME_EVENT`.
- Added WebUI one-click calendar sync actions in `apps/webui/src/App.tsx` for:
- 明日 DDL
- 未来事项时间线
- Added post-audit hardening fixes:
- Backend idempotency/duplicate-write protection via dedupe cache (`messageId + type + dueAt`) + TTL + bounded map maintenance.
- Frontend per-item in-flight lock (`syncingInsightKeysRef`) to block same-item double-dispatch race.
- Sanitized synced event external links with protocol allowlist (`http/https`) before rendering anchor targets.
- Hardened create-event parser to support nested `data` response variant from Composio tool payload.
- Added stale-past bound for `dueAt` to prevent creation of obsolete historical events.
- Updated docs in `README.md` to include M6 scope and calendar sync dedupe behavior.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed: unauthorized/login/invalid payload paths for `/api/mail/calendar/sync`; stale past `dueAt` rejected with controlled error.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m6_code_audit/report.md`.
- Initial findings: `High=1` (unsanitized synced event link), `Medium=3` (duplicate create risk, response shape compatibility, stale past-due creation).
- Final fixes after audit:
- Implemented all reported items in this iteration.
- Re-validation confirms final status: `Critical=0`, `High=0`.

### 2026-03-25T21:40:46+08:00

- Scope: M6 post-audit finalization and API semantics correction for stale `dueAt` validation path.
- Task type: `Code`
- Main changes:
- Updated `apps/bff/src/server.ts` `calendarSyncSchema` with request-layer `superRefine` stale-time guard (`dueAt` older than 2h now rejected at schema boundary).
- Kept `apps/bff/src/mail.ts` stale-time check as defense-in-depth, while primary user-facing validation now returns `400 Invalid payload` instead of downstream `502`.
- Re-ran full validation after this adjustment.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed:
- unauthenticated `/api/mail/calendar/sync` -> `401`
- login -> `200`
- invalid payload -> `400`
- stale `dueAt` -> `400` with field-level error details.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m6_code_audit/report.md` and `/root/m6_code_audit/recheck.md`.
- Recheck status: `Critical=0`, `High=0` after final server-side schema refinement.
- Final fixes after audit:
- Completed protocol-safe external link handling, duplicate-write mitigation (frontend in-flight + backend dedupe cache), response-shape compatibility hardening, and request-layer stale `dueAt` validation semantics.

### 2026-03-25T22:32:08+08:00

- Scope: M7 rollback capability for calendar sync (one-click delete) with audit-driven consistency hardening.
- Task type: `Code`
- Main changes:
- Added backend delete capability:
- New endpoint `POST /api/mail/calendar/delete` in `apps/bff/src/server.ts` with payload validation and authenticated access via existing `/api/*` session guard.
- Added `deleteCalendarEventById(eventId)` in `apps/bff/src/mail.ts` using `COMPOSIO_MULTI_EXECUTE_TOOL -> OUTLOOK_DELETE_EVENT`.
- Added frontend rollback interaction in `apps/webui/src/App.tsx`:
- For synced items, timeline actions now include `撤销同步`.
- Added delete in-flight lock (`deletingInsightKeysRef` + `deletingByItemKey`) to prevent duplicate delete dispatch.
- Added UI success feedback for sync/delete outcomes.
- Audit-driven hardening fixes:
- On sync dedupe-hit, backend now verifies cached `eventId` still exists (`OUTLOOK_GET_EVENT`) before returning cached result.
- If dedupe verification says event no longer exists, stale cache entry is evicted and a fresh create proceeds.
- Tightened `alreadyDeleted` detection in delete flow to prioritize structured Graph error code (`ErrorItemNotFound`) and status code.
- Updated README endpoint/UI scope to include delete rollback support.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed:
- login `200`
- calendar sync create `200`
- calendar delete `200`
- repeated delete returns `200` with `alreadyDeleted=true` semantics.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m7_code_audit/report.md`.
- Initial audit status: `Critical=0`, `High=0`, `Medium=2` (dedupe stale consistency, loose not-found matching).
- Recheck evidence location: `/root/m7_code_audit/recheck.md`.
- Final status after fixes: `Critical=0`, `High=0`.
- Final fixes after audit:
- Added dedupe-hit event existence verification and stale-cache eviction logic.
- Tightened delete not-found classification from loose regex toward structured error-code handling.

### 2026-03-25T22:35:36+08:00

- Scope: M7 calendar-sync rollback capability (`delete`) with dedupe-cache consistency hardening.
- Task type: `Code`
- Main changes:
- Added BFF endpoint `POST /api/mail/calendar/delete` with schema validation and authenticated execution.
- Added backend delete capability in `apps/bff/src/mail.ts` using `COMPOSIO_MULTI_EXECUTE_TOOL -> OUTLOOK_DELETE_EVENT`.
- Added stricter not-found handling in delete flow (`status_code=404` and Graph `ErrorItemNotFound` extraction) with idempotent response (`alreadyDeleted=true`).
- Added `isCalendarEventExisting` probe in `apps/bff/src/mail.ts` and wired dedupe-hit verification in `apps/bff/src/server.ts`:
- when dedupe cache hit occurs, server checks cached `eventId` still exists before returning deduped result;
- if event no longer exists, stale dedupe record is evicted and sync proceeds with fresh creation.
- Added cache cleanup on delete (`purgeCalendarSyncRecordsByEventId`) so resync works immediately after rollback.
- Added WebUI rollback UX in `apps/webui/src/App.tsx`:
- per-item `撤销同步` button for synced timeline entries;
- separate delete in-flight locks (`deletingInsightKeysRef` + `deletingByItemKey`);
- user feedback for delete outcomes (including `alreadyDeleted`).
- Updated styles and docs for rollback flow (`styles.css`, `README.md`).
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed:
- auth/login/sync/delete endpoints all return expected statuses.
- full create->dedupe->delete->resync->delete cycle passed:
- `sync1 deduplicated=false`
- `sync2 deduplicated=true, verified=true`
- after delete, `sync3 deduplicated=false` and returns a new `eventId`
- repeat delete returns `alreadyDeleted=true`.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m7_code_audit/report.md` and `/root/m7_code_audit/recheck.md`.
- Initial audit status: `Critical=0`, `High=0`, with medium suggestions on stale dedupe consistency and delete not-found over-match.
- Applied audit-guided fixes in this iteration and rechecked.
- Final fixes after audit:
- Added dedupe-hit event existence verification + stale cache eviction.
- Tightened delete not-found classification using structured Graph error parsing.
- Final recheck status: `Critical=0`, `High=0`.

### 2026-03-25T23:23:58+08:00

- Scope: M8 batch calendar operations (sync/delete) with audit-driven hardening for concurrency and resource safety.
- Task type: `Code`
- Main changes:
- Added batch endpoints in `apps/bff/src/server.ts`:
- `POST /api/mail/calendar/sync/batch` (max 10 items)
- `POST /api/mail/calendar/delete/batch` (max 20 eventIds)
- Refactored shared dedupe execution via `runCalendarSyncWithDedupe` to unify single/batch sync behavior.
- Added batch-route dedicated rate limiting (per-IP, sliding window) for sync/delete batch APIs.
- Added server-side duplicate `eventId` elimination for delete batch to avoid repeated upstream delete calls.
- Standardized batch per-item failure outputs to normalized error codes (`CALENDAR_SYNC_*`, `CALENDAR_DELETE_*`) to avoid leaking raw upstream error text to UI.
- Enhanced WebUI (`apps/webui/src/App.tsx`):
- Added `批量写入` and `批量撤销` actions in insights toolbar.
- Unified operation locking between batch and single-item actions to prevent concurrent state races.
- Added client-side batch caps alignment and friendly error text for partial failures.
- Updated docs (`README.md`) to M8 scope and new batch API contracts/rate-limit note.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed:
- batch sync create success;
- batch delete success;
- repeated batch delete returns `alreadyDeleted` counts;
- duplicate IDs in delete batch are deduplicated server-side;
- sync batch over-limit returns `400` with schema details.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m8_code_audit/report.md`.
- Initial status: `Critical=0`, `High=0`, `Medium=3`, `Low=2`.
- Applied fixes for key findings (duplicate ID dedupe, batch rate limit, lock unification, normalized batch errors).
- Recheck evidence location: `/root/m8_code_audit/recheck.md`.
- Final fixes after audit:
- Final recheck status `Critical=0`, `High=0`.

### 2026-03-25T23:36:21+08:00

- Scope: M9 batch API failure semantics hardening and race-window closure for batch/single calendar operations.
- Task type: `Code`
- Main changes:
- Backend semantics hardening in `apps/bff/src/server.ts`:
- `sync/batch` and `delete/batch` now return non-200 (`502`) with `ok=false` when `failedCount == total`.
- `delete/batch` now validates trimmed `eventId` length (`>=8`) before execution to avoid whitespace-edge ambiguity.
- Guarded all-failed condition with `dedupedEventIds.length > 0` to avoid zero-size false positives.
- Frontend safety hardening in `apps/webui/src/App.tsx`:
- Added `batchCalendarOpRef` synchronous latch to close batch/single operation race windows.
- Batch error mapping no longer falls back to raw backend message; unknown batch errors now resolve to generic safe text.
- Docs updated (`README.md`) to state all-failed non-200 behavior for batch endpoints.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke test passed:
- `delete/batch` with trim-invalid `eventId` returns `400 Invalid payload` with explicit validation detail.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m9_code_audit/report.md`.
- Initial status: `Critical=0`, `High=0`, `Medium=2`, `Low=2`.
- Applied fixes for medium items (trim boundary + ref latch + safe fallback error copy).
- Recheck evidence location: `/root/m9_code_audit/recheck.md`.
- Final fixes after audit:
- Final recheck status `Critical=0`, `High=0`.

### 2026-03-25T23:51:23+08:00

- Scope: M10 natural-language mail QA endpoint + WebUI QA panel, with audit-driven input-boundary hardening.
- Task type: `Code`
- Main changes:
- Added backend QA capability:
- `POST /api/mail/query` in `apps/bff/src/server.ts`.
- Added question-intent analyzer and answer generator in `apps/bff/src/mail.ts`:
- intents: `tomorrow_ddl`, `upcoming`, `unread_count`, `urgent_important`, `unknown`.
- response includes `answer` + structured `references` for direct message drilldown.
- Added frontend QA panel in `apps/webui/src/App.tsx`:
- free-form natural language question input,
- preset quick asks,
- structured answer and reference list (click to open message detail).
- Added QA card styles in `apps/webui/src/styles.css` and updated hero copy to M10.
- Updated docs in `README.md`:
- stack title -> M10,
- documented `POST /api/mail/query` endpoint and M10 UI scope.
- Audit-guided fixes applied in this iteration:
- fixed whitespace-only `question` handling to return `400 Invalid payload` (instead of falling into server-error path).
- aligned frontend QA textarea with backend limit via `maxLength={300}`.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed:
- `/api/mail/query` unauthorized path returns `401`.
- `/api/auth/login` returns `200` with session cookie.
- `/api/mail/query` with whitespace-only question returns `400` and explicit field detail.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m10_code_audit/report.md` and `/root/m10_code_audit/recheck.md`.
- Initial status: `Critical=0`, `High=0`, `Medium=1`, `Low=2`.
- Final fixes after audit:
- After fixes and recheck: `Critical=0`, `High=0`, `Medium=0`, `Low=1` (remaining low: `/api/mail/query` has no dedicated per-IP limiter).

### 2026-03-25T23:56:14+08:00

- Scope: M10.1 QA hardening follow-up (dedicated rate limit + frontend 429 feedback) with audit recheck closure.
- Task type: `Code`
- Main changes:
- Backend hardening in `apps/bff/src/server.ts`:
- added dedicated per-IP limiter for `POST /api/mail/query` (`mailQueryRateLimitPerMin = 24`);
- returns `429` with `Retry-After: 60` when exceeded.
- Frontend UX hardening in `apps/webui/src/App.tsx`:
- added friendly `429` handling for QA requests (`提问过于频繁，请稍后再试。`).
- Docs updated in `README.md`:
- documented `/api/mail/query` rate limit behavior.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed:
- `/api/auth/login` -> `200`.
- unauthenticated `/api/mail/query` -> `401`.
- authenticated whitespace question -> `400` with explicit `question` detail.
- QA limiter verified: first `429` observed at request `#25` during rapid authenticated calls.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Audit evidence location: `/root/m10_code_audit/report.md`.
- Recheck evidence location: `/root/m10_code_audit/recheck.md`.
- Final fixes after audit:
- prior remaining low issue (missing dedicated `/api/mail/query` limiter) is now resolved.
- latest recheck status: `Critical=0`, `High=0`, `Medium=0`.

### 2026-03-26T00:27:14+08:00

- Scope: M11 QA references calendar action closure + server-side content-integrity hardening.
- Task type: `Code`
- Main changes:
- Extended QA reference payload in `apps/bff/src/mail.ts` and `apps/webui/src/App.tsx` to include syncable fields (`dueAt`, `evidence`, `fromAddress`, `receivedDateTime`).
- Upgraded QA panel in `apps/webui/src/App.tsx`:
- QA references now support direct `写入日历/撤销同步` and event link access via existing calendar sync state.
- Added `qaReferenceToInsightItem` adapter so QA references can reuse existing single-item sync/rollback pipeline.
- Server-side integrity hardening in `apps/bff/src/server.ts`:
- `calendar/sync` and `calendar/sync/batch` now call `withTrustedCalendarSyncInput` to resolve authoritative `subject` by `messageId` before event write;
- no longer trust client free text for persisted event narrative (`dueDateLabel`/`evidence` set server-side control path).
- Event narrative derivation in `apps/bff/src/mail.ts`:
- `Evidence` and `Source Due Label` now derived server-side (`server_inferred:<type>` + dueAt/timezone-derived label), not from client payload.
- Docs updated in `README.md`:
- added QA-result calendar action note;
- clarified calendar sync integrity behavior (subject server lookup; client evidence/due label not used for persisted narrative).
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke test passed:
- `/api/auth/login` -> `200`.
- `/api/mail/query` with whitespace question -> `400` with explicit field detail.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m11_code_audit/report.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=1`.
- Recheck evidence: `/root/m11_code_audit/recheck.md`.
- Final fixes after audit:
- closed low integrity issue by enforcing trusted subject resolution and server-derived narrative fields.
- final recheck status: `Critical=0`, `High=0`, `Medium=0`, `Low=0`.

### 2026-03-26T00:29:32+08:00

- Scope: M11.1 post-audit refinement for trusted-subject path efficiency and final audit closure.
- Task type: `Code`
- Main changes:
- Refined `apps/bff/src/server.ts` sync flow to avoid unnecessary message-detail lookups on dedupe-hit paths:
- `runCalendarSyncWithDedupe` now performs trusted subject resolution only on dedupe-miss (new event creation path), while dedupe-hit returns cached event directly.
- Retained integrity guarantees:
- new event creation path still enforces server-resolved subject by `messageId` and ignores client `evidence/dueDateLabel` for persisted narrative.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Recheck evidence location: `/root/m11_code_audit/recheck.md`.
- Final fixes after audit:
- confirmed strategy correctness (`dedupe hit skip lookup`, `dedupe miss trusted lookup`) and closed previous low issue.
- latest recheck status: `Critical=0`, `High=0`, `Medium=0`, `Low=0`.

### 2026-03-26T09:24:10+08:00

- Scope: M12 efficiency dashboard for WebUI with audit-driven polish.
- Task type: `Code`
- Main changes:
- Added dashboard analytics in `apps/webui/src/App.tsx`:
- quadrant distribution visualization;
- next upcoming key item countdown + quick actions (open mail / sync / rollback / open event link);
- top senders frequency list;
- calendar sync coverage KPI + progress bar.
- Added dashboard styles in `apps/webui/src/styles.css` and responsive layout support.
- Updated docs in `README.md`:
- stack/UI scope updated to M12;
- documented new efficiency dashboard capabilities.
- Audit-guided fixes in this iteration:
- fixed stale countdown display by introducing periodic tick (`setInterval` + cleanup) and recomputation dependency.
- fixed 0% progress visual mismatch by removing `min-width` from dashboard fill style.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m12_code_audit/report.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=2`.
- Recheck evidence: `/root/m12_code_audit/recheck.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=0`.
- Final fixes after audit:
- dashboard countdown now updates every minute.
- progress bars now visually match 0% values.

### 2026-03-26T10:03:03+08:00

- Scope: M13 personalized priority rules for mail triage/insights/QA with session isolation hardening.
- Task type: `Code`
- Main changes:
- Added personalized priority rule model and matching pipeline in `apps/bff/src/mail.ts` (`field + pattern + priority -> quadrant`).
- Added rule APIs in `apps/bff/src/server.ts`:
- `GET /api/mail/priority-rules`
- `POST /api/mail/priority-rules`
- `POST /api/mail/priority-rules/update`
- `POST /api/mail/priority-rules/delete`
- Wired rule snapshots into `triage`, `insights`, and `mail/query` flows.
- Added session-isolated in-memory rule storage and session-expiry cleanup.
- Added per-route read/write rate limits for rule endpoints.
- Added duplicate-rule conflict rejection (`409`).
- Added WebUI rule management panel in `apps/webui/src/App.tsx` + `apps/webui/src/styles.css`:
- create / enable-disable / delete / priority ordering inputs.
- post-operation forced re-fetch to avoid optimistic-state drift.
- Updated docs in `README.md` to M13 scope and rule API semantics.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests passed for login + rule CRUD + duplicate conflict + session isolation.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m13_code_audit/report.md` -> `Critical=0`, `High=1`, `Medium=3`, `Low=2`.
- Recheck evidence: `/root/m13_code_audit/recheck.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=0`.
- Final fixes after audit:
- migrated rules from global store to session-isolated store.
- added deterministic precedence (`priority ASC`, then `createdAt`, then `id`).
- added missing rate limits and duplicate-rule guard.
- fixed frontend rule list consistency by forced backend refresh after mutate operations.

### 2026-03-26T10:03:03+08:00

- Scope: M14 notification center (urgent push + daily digest schedule) with concurrency/race hardening.
- Task type: `Code`
- Main changes:
- Added notification preference/state APIs in `apps/bff/src/server.ts`:
- `GET /api/mail/notifications/preferences`
- `POST /api/mail/notifications/preferences`
- `GET /api/mail/notifications/poll`
- Added session-isolated notification memory model:
- per-session preference store (urgent push, daily digest switch, digest hh:mm + timezone).
- per-session runtime state (`seenUrgentMessageIds`, `lastDigestDateKey`, `lastDigestSentAt`).
- Added background cleanup + map bounds + session-expiry/logout cleanup for notification state.
- Added notification poll concurrency gate (per-session lock) and route rate limits.
- Added WebUI notification center in `apps/webui/src/App.tsx` + `apps/webui/src/styles.css`:
- notification permission request (Browser Notification API).
- notification preference form (urgent switch, daily summary schedule/timezone).
- periodic and manual poll trigger.
- in-page notification log.
- Added race hardening in WebUI:
- poll in-flight guard to prevent overlapping polls.
- draft-dirty tracking so server refresh does not clobber unsaved notification form edits.
- fixed triage/detail stale-closure race via selected-message ref.
- Updated docs in `README.md` to M14 scope and notification API notes.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests:
- notification preferences GET/POST returned `200`.
- invalid empty preference update returned `400` with explicit detail.
- concurrent poll test returned one `429 Notification poll already in progress` (lock effective).
- first poll path currently returned upstream tool failure `502` in this environment (`"1 out of 1 tools failed"`).
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m14_code_audit/report.md` -> `Critical=0`, `High=1`, `Medium=2`, `Low=0`.
- Recheck evidence: `/root/m14_code_audit/recheck.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=0`.
- Final fixes after audit:
- closed duplicate notification risk with frontend in-flight guard + backend per-session lock.
- prevented unsaved form override with notification draft dirty-state gating.
- fixed mail-detail stale selection race using selected message ref.

### 2026-03-26T10:19:21+08:00

- Scope: M15 realtime notification channel (SSE) + delivery/session safety hardening.
- Task type: `Code`
- Main changes:
- Added SSE notification endpoint in `apps/bff/src/server.ts`:
- `GET /api/mail/notifications/stream`
- event contract now includes `notification`, `keepalive`, `notification_busy`, `notification_error`, `session_expired`.
- Added stream connect-rate limiting and same-session poll-lock coordination.
- Added per-tick session revalidation for SSE stream; when session is revoked/expired server now emits `session_expired` and closes stream.
- Refactored notification poll core to two-phase model:
- snapshot computation + explicit `commit()` for state mutation.
- `poll` route commits before response return.
- `stream` route commits only after event payload write path succeeds.
- This closes lost-alert risk from early state advancement on failed/aborted snapshot path.
- Added session helper reuse in `apps/bff/src/server.ts`:
- `clearSessionState(...)`
- `touchSessionIfActive(...)`
- Updated frontend `apps/webui/src/App.tsx` notification transport behavior:
- uses `EventSource` realtime stream by default.
- falls back to periodic poll when stream disconnects.
- handles `session_expired` event and forces re-auth.
- Added stream channel status indicator in notification center (实时/连接中/轮询/未连接).
- Updated docs in `README.md`:
- stack title -> M15,
- documented SSE endpoint + event semantics and fallback behavior.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests:
- `/api/mail/notifications/stream` returned `200` and emitted SSE events (`notification_error` in current upstream-failing env).
- session safety test passed: after `POST /api/auth/logout`, active SSE stream emitted `session_expired` then closed.
- `/api/mail/notifications/preferences` remained `200` after M15 changes.
- `/api/mail/notifications/poll` in this environment still returns upstream tool failure `502 ("1 out of 1 tools failed")`.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m15_code_audit/report.md` -> `Critical=0`, `High=1`, `Medium=1`, `Low=0`.
- Recheck evidence: `/root/m15_code_audit/recheck.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=0`.
- Final fixes after audit:
- fixed SSE post-logout/post-expiry data-leak risk with per-tick session revalidation + forced stream close.
- fixed notification state early-advance risk by introducing explicit commit step and stream write-gated commit behavior.

### 2026-03-26T10:40:03+08:00

- Scope: M16 notification reliability hardening (structured error contract + adaptive retry/backoff).
- Task type: `Code`
- Main changes:
- Backend notification error contract hardened in `apps/bff/src/server.ts`:
- poll/stream errors now include structured runtime fields: `errorCode`, `retryable`, `retryAfterSec`, `status`, `at`.
- added unified notification error mapper for `NotificationPollInProgressError`, gateway HTTP errors, upstream tool failures, and internal errors.
- stream events now emit structured payloads for `notification_error`, `notification_busy`, and enriched `session_expired`.
- Frontend transport hardening in `apps/webui/src/App.tsx`:
- `HttpError` now preserves response payload for error-code-aware handling.
- added notification runtime error parser + user-facing retry hint formatter.
- poll fallback now applies adaptive interval strategy (uses `retryAfterSec` when available; otherwise bounded exponential backoff).
- SSE reconnect now uses runtime hint-driven reconnect delay instead of fixed-only retry cadence.
- Added stale-result/race guard for notification config changes:
- introduced `notificationConfigVersionRef` and version-gated apply/schedule flow for fallback polls and stream event handlers.
- This prevents outdated in-flight poll/stream updates from previous `limit/horizon/tz` config versions from mutating current UI state.
- Docs updated in `README.md`:
- stack title -> M16.
- documented structured notification error fields and adaptive retry semantics.
- clarified auth contract boundary: initial unauthenticated requests are plain global-hook `401`, while structured runtime fields apply in authenticated notification route/events.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests:
- concurrent poll race returns structured `429` body with `errorCode=NOTIFICATION_POLL_IN_PROGRESS` and `retryAfterSec=2`.
- SSE stream returns `notification` and, after logout, structured `session_expired` event with `errorCode=UNAUTHORIZED`.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m16_code_audit/report.md` -> `Critical=0`, `High=0`, `Medium=1`, `Low=2`.
- Recheck evidence: `/root/m16_code_audit/recheck.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=0`.
- Final fixes after audit:
- closed stale-notification race with config-version gating across fallback polling and stream handlers.
- made SSE reconnect delay adaptive from runtime retry hints (`retryAfterSec`).
- closed contract ambiguity by explicitly documenting plain global-hook 401 vs structured authenticated notification runtime errors.

### 2026-03-26T11:20:29+08:00

- Scope: M17 multi-source control-plane foundation + source-safe request pipeline (backend + webui) with audit-driven hardening.
- Task type: `Code`
- Main changes:
- Backend `apps/bff/src/server.ts`:
- completed source-aware routing for `triage / insights / query / message / priority-rules / notifications`.
- added source management API set: `/api/mail/sources`, `/api/mail/sources/update`, `/api/mail/sources/delete`, `/api/mail/sources/select` (already introduced in M17 foundation, now integrated end-to-end in frontend).
- message route now validates `sourceId` contract and returns `sourceId` in response.
- calendar sync contracts are now source-aware:
- `calendar sync / batch sync / delete / batch delete` accept/validate `sourceId` via `requireResolvedSourceId` and return source-scoped response payloads.
- fixed calendar dedupe correctness and isolation:
- dedupe key now scoped by `session + source + messageId + type + dueAt`.
- added per-key in-flight dedupe lock to prevent concurrent double-create.
- changed dedupe verification-failure behavior to fail-closed (no cached fallback, no auto-recreate on verification error).
- improved notification source safety:
- notification poll result now includes `sourceId`.
- poll computation validates source availability each run and throws structured `MAIL_SOURCE_NOT_FOUND`.
- SSE stream now closes on `MAIL_SOURCE_NOT_FOUND` to avoid deleted-source state resurrection.
- mail-query route limiter is now session-scoped (`scopedRouteKey("mail_query", sessionToken)`).
- Frontend `apps/webui/src/App.tsx` + `apps/webui/src/styles.css`:
- added full mail-source management UI:
- source list refresh, active source switch, create custom source profile, enable/disable/delete custom sources.
- introduced source-scoped data refresh pipeline after source switch (triage/insights/rules/notifications reload).
- all core data APIs now pass `sourceId`:
- triage, insights, priority-rules CRUD, notification prefs/poll/stream, mail QA, message detail, calendar sync/delete/batch.
- added robust anti-stale guards with `requestSourceId` checks before applying async results.
- hardened SSE + polling against old-source event/result contamination (source/config-version checks).
- locked source controls during notification saving to reduce cross-source race windows.
- improved notification manual poll button disable conditions to avoid noisy overlap states.
- updated hero/version copy to M17.
- Docs:
- updated `README.md` to M17, documented source endpoints and `sourceId` query/body contract.
- explicitly documented current architectural boundary: source profiles are control-plane abstraction; data-plane still uses single Outlook connection pipeline in this stage.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial backend audit evidence: `/root/m17_code_audit/initial_backend.md` -> `Critical=1`, `High=3`, `Medium=3`, `Low=1`.
- Initial frontend audit evidence: `/root/m17_code_audit/initial_frontend.md` -> `Critical=0`, `High=1`, `Medium=3`, `Low=1`.
- Recheck frontend audit evidence: `/root/m17_code_audit/recheck_frontend.md` -> `Critical=0`, `High=0`, `Medium=0`, `Low=0`.
- Recheck backend audit evidence: `/root/m17_code_audit/recheck_backend.md` -> `Critical=0`, `Medium=0`, `Low=0`, `High=1` (residual architecture limitation).
- Final fixes after audit:
- fixed calendar dedupe isolation, dedupe concurrency race, and verification-failure fallback bug.
- fixed source contract gaps in message/calendar routes and frontend calendar/notification flows.
- fixed source-stale async apply risks in WebUI by adding source-bound guards and control locking.
- Residual known limitation:
- backend `mail.ts` data-plane (`invokeTool` chain) is not yet source-context aware for true multi-account physical isolation; this remains next-stage work beyond M17 control-plane foundation.

### 2026-03-26T15:55:17+08:00

- Scope: M18 sourceContext data-plane pass-through (`mail.ts` + tool invocation chain) with audit-driven hardening.
- Task type: `Code`
- Main changes:
- Backend `apps/bff/src/mail.ts`:
- introduced `MailSourceContext` and unified source-aware Composio argument builder for `COMPOSIO_MULTI_EXECUTE_TOOL` calls.
- source-aware injection now covers inbox/query/detail/calendar flows via Outlook `user_id` where applicable.
- added `connected_account_id` passthrough support when source profile includes `connectedAccountId`.
- calendar create path no longer hardcodes `user_id: "me"`; source context can now override correctly.
- calendar delete hardened with fail-closed source verification on `alreadyDeleted` path (prevents false-positive delete success under source mismatch).
- Backend `apps/bff/src/server.ts`:
- added source profile fields: `mailboxUserId` and `connectedAccountId`.
- added source context resolver and wired it through triage/insights/query/message/notification/calendar call chain.
- `mail/sources` create/update now validate source-context fields:
- `mailboxUserId` must be `me` or email/UPN or GUID.
- `connectedAccountId` must match `^ca_[A-Za-z0-9_-]+$` when provided.
- added explicit best-effort routing log when source has `connectedAccountId` configured.
- Frontend `apps/webui/src/App.tsx`:
- source profile schema/type extended with `mailboxUserId` and `connectedAccountId`.
- source create form now supports both fields and sends them to backend.
- added frontend semantic validation for both fields before submit (clear, field-specific error messages).
- fixed draft-state hygiene: source create form drafts are cleared on source switch paths (manual select, disable-triggered switch, delete-triggered switch).
- added explicit UX note: to modify source-context fields currently delete-and-recreate source.
- UI hero/version copy updated to M18.
- Docs:
- updated `README.md` to M18.
- documented new source fields, validation rules, and M18 source-context behavior.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests:
- invalid `mailboxUserId` returns `400 Invalid payload`.
- invalid `connectedAccountId` returns `400 Invalid payload`.
- source with invalid-but-format-valid `mailboxUserId` causes source-scoped triage failure as expected (`ok=false`).
- clearing source context (`mailboxUserId`/`connectedAccountId`) restores same source triage success (`ok=true`).
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial audit evidence: `/root/m18_code_audit/report.md` -> backend `High=2, Medium=1`; frontend `Medium=1, Low=2`.
- Recheck evidence: `/root/m18_code_audit/recheck.md` -> backend `Critical=0, High=0, Medium=0, Low=1`; frontend `Critical=0, High=0, Medium=0, Low=0`.
- Final fixes after audit:
- fixed calendar create source-context override bug (hardcoded `me` removed).
- fixed calendar delete source-mismatch false-positive risk with additional source-aware existence verification.
- fixed frontend source-context input validation gap and source-switch draft residue gap.
- added explicit product boundary hint for source-context field editability.
- Residual known limitation:
- `connectedAccountId` routing is still best-effort passthrough; upstream acceptance is not yet API-verifiable (currently visible via logs/documentation).

### 2026-03-26T17:06:35+08:00

- Scope: M19 source-routing verification hardening (frontend + backend fail-fast closure) with full audit/recheck loop.
- Task type: `Code`
- Main changes:
- Frontend `apps/webui/src/App.tsx`:
- fixed login path fail-fast enforcement before source-scoped loads.
- refactored mail-source snapshot handling to separate fetch snapshot vs state commit (`loadMailSources(..., commitState)` + `commitMailSourceSnapshot`).
- added server-authoritative re-check after source select and blocked unsafe commits when selected source fails routing verification.
- fixed verify-active-source failure handling to immediately clear source-scoped views and block follow-up refresh.
- added safe rollback resolver (enabled + verification-safe source only) and synchronized rollback to backend active source (`/api/mail/sources/select`), avoiding client/server active-source drift.
- added rollback failure recovery path: re-pull server snapshot and surface explicit error instead of silently swallowing rollback sync errors.
- notification channel now fully honors fail-fast:
- SSE/poll/manual poll do not run on blocked source.
- notification stream effect aborts early on active-source fail-fast state.
- manual poll button is disabled when active source is blocked.
- Backend `apps/bff/src/server.ts`:
- added centralized route guard `requireSourceRoutingReady(...)` with structured `412` errors:
- `MAIL_SOURCE_ROUTING_UNVERIFIED` for missing verification status.
- `MAIL_SOURCE_ROUTING_NOT_READY` for failed/failFast routing status.
- applied guard to source-context data routes:
- `triage`, `insights`, `query`, `message`, `calendar sync/delete` (single+batch), `notifications poll/stream`.
- fixed `POST /api/mail/sources/verify` empty-body compatibility via `safeParse(request.body ?? {})`.
- hardened SSE stream by re-validating routing on every tick; invalid routing now emits `notification_error` then closes stream.
- Docs:
- updated `README.md` M19 notes with backend fail-fast contract (`412 + errorCode`), SSE per-tick revalidation behavior, verify empty-body support, and frontend fail-fast rollback semantics.
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Runtime smoke tests:
- `login=200`
- `verify (empty body {})=200`
- unverified source `GET /api/mail/triage` => `412 MAIL_SOURCE_ROUTING_UNVERIFIED`
- unverified source `GET /api/mail/notifications/poll` => `412 MAIL_SOURCE_ROUTING_UNVERIFIED`
- unverified source `GET /api/mail/notifications/stream` => `412 MAIL_SOURCE_ROUTING_UNVERIFIED`
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
- Initial + iterative audit evidence: `/root/m19_code_audit/report.md`
- Final recheck evidence: `/root/m19_code_audit/recheck.md` -> backend/frontend `Critical=0, High=0, Medium=0, Low=0`.
- Final fixes after audit:
- closed backend-only/frontend-only fail-fast gaps by enforcing both-side guards.
- closed SSE post-connect routing bypass with per-tick server routing verification.
- closed source rollback disabled-target risk and rollback sync drift risk.

### 2026-03-26T17:19:24+08:00

- Scope: Production deployment to domain (`true-sight.asia`) on current host, with runtime hardening and audit closure.
- Task type: `Deploy + Code`
- Main changes:
- Environment/DNS verification:
  - confirmed current host public IP is `43.134.49.247`.
  - confirmed `true-sight.asia` A record resolves to `43.134.49.247`.
- Frontend deployment:
  - added production env file `apps/webui/.env.production` with `VITE_BFF_BASE_URL=https://true-sight.asia`.
  - rebuilt frontend and published static assets to `/var/www/true-sight.asia`.
- Backend deployment:
  - created and enabled systemd service `/etc/systemd/system/openclaw-mail-bff.service`.
  - service runtime: `node /root/.openclaw/workspace/apps/bff/dist/server.js` with `EnvironmentFile=/root/.openclaw/workspace/apps/bff/.env`.
  - enforced loopback bind by updating `.env` to `HOST=127.0.0.1`.
  - updated `.env` CORS origins to include production domain.
- Nginx deployment:
  - updated `/etc/nginx/sites-available/email-ai-agent` to serve `/var/www/true-sight.asia`.
  - proxied `/api/*`, `/live`, `/ready`, `/health` to `127.0.0.1:8787`.
  - added SSE-friendly proxy settings for `/api/mail/notifications/stream` (`proxy_buffering off`, long `proxy_read_timeout`).
- TLS:
  - installed `certbot` + `python3-certbot-nginx`.
  - issued and installed Let's Encrypt cert for `true-sight.asia`.
  - enabled HTTP -> HTTPS redirect.
  - verified `certbot.timer` exists for auto-renew.
- Security hardening code fix (`apps/bff/src/server.ts`):
  - session cookie `Secure` is now enabled when `NODE_ENV=production` OR `X-Forwarded-Proto` indicates HTTPS.
  - avoids accidental non-secure cookies in reverse-proxy HTTPS deployments with env drift.
- Docs:
  - updated `README.md` deployment section with production startup chain and required env semantics.
- Validation completed:
  - `npm run check` passed.
  - `npm run build` passed.
  - service checks passed (`openclaw-mail-bff.service` active, nginx config test OK).
  - smoke tests (domain via local resolve) passed:
    - `GET /` -> `200`
    - `GET /ready` -> `200`
    - `POST /api/auth/login` -> `200`
    - authenticated `GET /api/meta` -> `200`
    - `Set-Cookie` includes `Secure`.
- Sub-agent audit findings (include evidence location, or `Audit: N/A (no code changes)`):
  - Initial deployment audit evidence: `/root/m19_deploy_audit/report.md` (`High=1`, `Medium=1`).
  - Final recheck evidence: `/root/m19_deploy_audit/recheck.md` -> backend/frontend `Critical=0, High=0, Medium=0, Low=0`.
- Final fixes after audit:
  - fixed secure-cookie robustness for HTTPS reverse proxy deployments.
  - completed deployment docs for production build/start/env chain to prevent runtime drift.

### 2026-03-26T17:57:22+08:00

- Scope: M20 邮箱一键登录（Composio Outlook 授权）落地，含后端接口、前端登录卡片、审计回修与生产发布。
- Task type: `Code + Deploy`
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增并完善 `POST /api/mail/connections/outlook`（调用 `COMPOSIO_MANAGE_CONNECTIONS`），支持状态查询与授权发起。
  - 修复工具响应解析兼容：同时支持 `raw.content` 与 `raw.result.content` 文本载荷。
  - 增加连接会话边界控制：仅允许复用当前 BFF 会话内已记录的 `sessionId`。
  - 增加 `reinitiate` 安全约束：必须携带已知 `sessionId`，并追加更严格限流。
  - 收敛响应最小披露：不再透传 `current_user_info` / 原始 instruction 与上游原始 error 文本。
  - 授权跳转 URL 加白名单与 TLS 约束：仅 `localhost/127.0.0.1` 允许 `http`，其余白名单域强制 `https`。
- Frontend `apps/webui/src/App.tsx` + `styles.css`:
  - 新增“邮箱登录（Outlook）”卡片：一键连接、检查连接状态、重新发起授权、新窗口/当前页跳转。
  - 新增连接结果展示与 `connectedAccountId` 一键回填到“邮件数据源”表单。
  - 增加请求并发与乱序防护（in-flight lock + request seq gating），避免旧响应覆盖新状态或触发错误跳转。
  - 修复回填状态污染：改为函数式更新，避免覆盖用户请求期间的手工输入。
  - 前端授权链接新增 host allowlist 校验。
- Docs:
  - `README.md` 升级到 M20，补充 `POST /api/mail/connections/outlook` 与 UI 范围说明。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 生产烟测（`https://true-sight.asia`）:
  - `GET /ready` -> `200`
  - `POST /api/auth/login` -> `200`
  - `POST /api/mail/connections/outlook` -> `200`
  - `POST /api/mail/connections/outlook` with `{"reinitiate":true}` and no `sessionId` -> `400`（符合新约束）
- Deployment:
  - 已发布前端静态资源到 `/var/www/true-sight.asia`（`rsync --delete`）。
  - 已重启并确认 `openclaw-mail-bff.service` 为 `active`。
- Sub-agent audit findings:
  - 初审（backend/frontend）：`/root/m20_code_audit/initial_backend.md`, `/root/m20_code_audit/initial_frontend.md`
  - 复审：`/root/m20_code_audit/recheck_backend.md`, `/root/m20_code_audit/recheck_frontend.md`
  - 最终结论：`Critical=0 / High=0 / Medium=0 / Low=0`

### 2026-03-26T21:27:43+08:00

- Scope: M21 邮箱源接入流程重构为“第三方邮箱连接”模式（授权 -> 创建 -> 验证 -> 激活），并完成 fail-fast 竞态修复。
- Task type: `Code`
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - Mail Source 控制面创建接口改为强约束：`POST /api/mail/sources` 必填 `label + mailboxUserId + connectedAccountId`。
  - Source 视图新增 `ready` 回传（`GET /api/mail/sources`、create/update response）。
  - `POST /api/mail/sources/select` 增加后端硬约束：`ready=false` 返回 `412 MAIL_SOURCE_NOT_READY`，阻止未验证源被激活。
  - `POST /api/mail/sources/verify` 返回 `ready` 字段（由 `routingVerified && !failFast` 推导）。
  - `/api/mail/sources/update` 仅在路由上下文字段变更时重置 routing status；非路由字段（label/emailHint/enabled）不再清空已验证状态。
  - 412 错误体路由状态空值语义统一（不再返回 `routingStatus: null`）。
- Backend `apps/bff/src/mail.ts`:
  - 路由探针升级：优先使用 `OUTLOOK_GET_ME` 进行轻量连通性验证；若不可用回退轻量 inbox query。
  - 对 `mailboxUserId` 增加反向探测（invalid mailbox probe），避免上游忽略 `user_id` 时误判 `ready=true`。
  - 数据平面继续通过 `composioMultiExecuteArgs` 统一注入 `connected_account_id` 与 source-aware 参数，覆盖 triage/insights/query/calendar/message 等路径。
- Frontend `apps/webui/src/App.tsx`:
  - Source 创建提交函数改为闭环：`create(label+mailboxUserId+connectedAccountId) -> verify -> refresh snapshot`。
  - 创建成功但验证失败时增加兜底刷新与明确提示，避免前后端状态漂移。
  - 创建成功后刷新结果显式校验，刷新失败不再输出成功提示。
  - Source profile schema 增加 `ready`；下拉切换与“切换到此源”均统一要求 `enabled && ready`。
  - fail-fast 处理收敛为 `412 + errorCode=MAIL_SOURCE_*`，避免误处理其他业务 412。
  - 修复 412 竞态：在关键读取链路 catch 中加入 `requestSourceId === activeSourceIdRef.current` 短路，避免旧 source 回包污染当前 source 状态。
- Docs:
  - `README.md` 更新 Source 创建/验证/激活流程说明与接口约束（M20 文档内容补充到强约束流程）。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Sub-agent audit findings:
  - 初审：`/root/m21_code_audit/initial_backend.md`, `/root/m21_code_audit/initial_frontend.md`
  - 复审：`/root/m21_code_audit/recheck_backend.md`, `/root/m21_code_audit/recheck_frontend.md`
  - 最终结论：`Critical=0 / High=0 / Medium=0 / Low=0`

### 2026-03-26T22:37:14+08:00

- Scope: M22 “Outlook 完全自动接入”落地（授权检查/拉起 -> 自动建源 -> 自动验证 -> 自动激活），并完成子代理审计回修闭环。
- Task type: `Code`
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增 `POST /api/mail/sources/auto-connect/outlook`，返回阶段化结果：`authorization_required | ready | verification_failed | connection_failed`。
  - 接入链路收敛为单接口：连接状态判断、自动 source 创建/复用、路由验证、可选自动激活。
  - 自动建源幂等优化：按 `connectedAccountId` 优先去重复用，避免 `me/email` 形态差异导致重复 source。
  - 安全加固：
    - `COMPOSIO_MANAGE_CONNECTIONS` 调用增加会话作用域 `sessionKey`（哈希后下发，避免原始 session token 外送）。
    - 严格要求返回 Outlook toolkit 结果，不再回退到非 Outlook 项。
    - 外部 await 后增加 session 活性复核与 `UNAUTHORIZED` 错误码返回。
    - `OUTLOOK_CONNECTION_SESSION_EXPIRED` / `OUTLOOK_CONNECTION_SESSION_REQUIRED` 错误码化，供前端稳定识别。
- Frontend `apps/webui/src/App.tsx`:
  - 新增“一键自动接入并激活”提交流程 `onAutoConnectAndActivateSource`。
  - 新增 OAuth 续跑：本地草稿记录 `sessionId`，登录后/回焦可自动续跑未完成接入。
  - 修复自动续跑竞态：加入 busy 门控 + pending-resume 队列，避免请求风暴和并发状态污染。
  - fail-fast 回滚逻辑改为与 phase 解耦：只要当前激活源不安全即回滚。
  - 授权链接安全收紧：非 loopback 主机仅允许 `https`。
  - 过期会话识别改为优先 `errorCode`，保留 message 兜底。
  - 草稿存储改进：`createdAt` 校验、按 `bffBaseUrl` 命名空间隔离、`localStorage` 异常保护。
  - UI 补充 `sessionInstructions` 指引展示（redirect 缺失时仍可继续授权）。
- Docs:
  - `README.md` 新增自动接入接口与 UI 说明。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Sub-agent audit findings:
  - 初审：`/root/m22_code_audit/report.md`
  - 复审：`/root/m22_code_audit/recheck.md`
  - 最终结论：`Backend Critical/High/Medium/Low = 0/0/0/0`，`Frontend Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-26T22:42:24+08:00

- Scope: M22 线上发布（部署到 `https://true-sight.asia`）与运行烟测。
- Task type: `Deploy`
- Main changes:
- 重新构建并发布：
  - `npm run build`（workspace）通过。
  - 前端静态资源已同步到 `/var/www/true-sight.asia`（`rsync --delete`）。
- 服务重启：
  - `openclaw-mail-bff.service` 已重启并保持 `active (running)`。
- 线上验证：
  - `GET https://true-sight.asia/` -> `200`
  - `GET https://true-sight.asia/ready` -> `200`
  - `POST /api/auth/login` -> `200`
  - `GET /api/meta`（登录后）-> `200`
  - `POST /api/mail/sources/auto-connect/outlook`（登录后）-> `200`（返回 `phase=verification_failed`，说明接口可达且流程已执行；该 phase 取决于上游路由探针校验结果）
  - 产物校验：线上 js 资源包含“一键自动接入并激活”UI 文案。
- Sub-agent audit findings:
  - Audit: N/A（本次为部署动作；对应代码审计已在 M22 完成并收敛到 `0/0/0/0`，见 `/root/m22_code_audit/recheck.md`）。

### 2026-03-27T00:19:29+08:00

- Scope: M23 Outlook 授权流程收敛为“单按钮弹出 Composio 外部授权窗口”，并完成子代理审计回修与线上复核。
- Task type: `Code + Deploy`
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增并启用 `POST /api/mail/connections/outlook/launch-auth` 单用途接口，仅用于拉起 Composio 外部授权。
  - 调用 `COMPOSIO_MANAGE_CONNECTIONS` 时固定 `reinitiate_all: true`，并收敛返回结构（`status/toolkit/redirectUrl/sessionInstructions`）。
  - 删除遗留 `/api/mail/connections/outlook/start` 入口，避免旧路径绕过新流程。
  - 未登录错误返回补齐 `errorCode=UNAUTHORIZED`，便于前端稳定识别。
  - 授权跳转主机白名单进一步收紧，避免过宽域后缀放行。
- Frontend `apps/webui/src/App.tsx`:
  - 新增单按钮处理函数 `onLaunchOutlookAuthWindow`，仅调用 `/api/mail/connections/outlook/launch-auth`。
  - 先同步打开空白弹窗，再异步替换到 `redirectUrl`，降低浏览器拦截概率。
  - 若弹窗被拦截，自动回退当前页跳转 `window.location.assign(...)`。
  - 回焦后自动触发连接状态 reconcile；清理旧 `start` 逻辑与相关类型。
  - 登录按钮禁用条件对齐 `authBusy/authChecking`，避免重复触发。
- Docs:
  - `README.md` 已更新为“单按钮外部授权”说明（与 M23 实现一致）。
- Validation completed:
  - `npm run check` passed.
  - `npm run build` passed.
  - 线上验证：
    - `GET https://true-sight.asia/` -> `200`
    - `GET https://true-sight.asia/ready` -> `200`
    - `POST /api/auth/login`（登录后）-> `200`
    - `POST /api/mail/connections/outlook/launch-auth`（登录后）-> `200`
    - 返回 `result.redirectUrl=https://connect.composio.dev/link/...`（可用于外部授权页跳转）
- Deployment:
  - 前端静态资源已发布到 `/var/www/true-sight.asia`。
  - `openclaw-mail-bff.service` 已重启并保持 `active (running)`。
- Sub-agent audit findings:
  - 初审：`/root/m23_code_audit/report.md`
  - 复审：`/root/m23_code_audit/recheck.md`
  - 最终结论：`Backend Critical/High/Medium/Low = 0/0/0/0`，`Frontend Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-27T01:34:57+08:00

- Scope: M24 修复“Outlook 已连接但邮件能力报 `OUTLOOK_QUERY_EMAILS response data is missing`”问题，并完成子代理审计回修闭环。
- Task type: `Code + Deploy`
- Root cause verification:
  - 线上日志反复出现 `OUTLOOK_QUERY_EMAILS response data is missing`，触发于 triage/insights/notifications。
  - 通过 MCP `tools/list` 实查发现当前 Composio `COMPOSIO_MULTI_EXECUTE_TOOL` 输入 schema 不包含 `connected_account_id`，导致该字段在当前上游上下文属于 best-effort/可能被忽略。
- Main changes:
- Backend `apps/bff/src/mail.ts`:
  - 强化 Composio 响应解析兼容：
    - 兼容 `result.content` 与顶层 `content` 文本载荷。
    - 兼容 `response.data` 及 `response.value/messages/items` 变体。
    - 新增 payload/response 成功判定辅助函数，兼容 `successful` 缺失但结果可判成功的返回。
  - 收敛 probe fallback：`OUTLOOK_GET_ME` 探针失败时按错误类型决定是否回退 `OUTLOOK_QUERY_EMAILS`，并避免吞掉明显鉴权类错误。
  - 改进错误可观测性：schema mismatch 报错包含路径与 issue 摘要。
  - 收紧日历删除“已删除”判定，去除过宽文本匹配。
- Backend `apps/bff/src/server.ts`:
  - 路由验证策略修复：
    - 保留 mailbox 锚定回退（`connectedAccountId` 不可强验证时）但新增 `mailboxUserId != me` 约束。
    - 当 connectedAccount 未通过强验证时，数据面不再强制透传 `connectedAccountId`。
  - 会话与状态清理强化：
    - 增加 session 容量淘汰的显式 `clearSessionState` 路径。
    - 增加按 session 清理 calendar dedupe/in-flight 状态。
  - 安全加固：
    - `/api/gateway/tools/invoke` 增加 denylist（`COMPOSIO_MULTI_EXECUTE_TOOL` / `COMPOSIO_MANAGE_CONNECTIONS` / `COMPOSIO_WAIT_FOR_CONNECTIONS`），禁止通过通用透传绕过专用安全护栏。
    - tools policy 匹配增加大小写/空白归一化。
  - source update 收敛：
    - 禁止通过空字符串清空 `mailboxUserId` 或 `connectedAccountId`。
    - 强制二者成对配置，阻断“清空路由上下文 -> ready”降级路径。
- Docs:
  - `README.md` 更新为当前行为（source verify 回退语义、Composio 返回兼容、connectedAccount best-effort 说明）。
- Validation completed:
  - `npm run check` passed.
  - `npm run build` passed.
  - 线上烟测通过：
    - `POST /api/auth/login` -> `200`
    - `GET /api/mail/triage`（default）-> `200`
    - `POST /api/mail/sources` -> `200`
    - `POST /api/mail/sources/verify` -> `200`
    - `POST /api/mail/sources/select` -> `200`
    - `GET /api/mail/triage`（custom source）-> `200`
    - `GET /api/mail/insights`（custom source）-> `200`
    - `POST /api/gateway/tools/invoke` with `composio_multi_execute_tool` -> `403`
    - `POST /api/mail/sources/update` with empty mailbox -> `400`
  - 最近 15 分钟日志中未再出现 `OUTLOOK_QUERY_EMAILS response data is missing`。
- Deployment:
  - 前端静态资源已发布到 `/var/www/true-sight.asia`。
  - `openclaw-mail-bff.service` 已重启并保持 `active (running)`。
- Sub-agent audit findings:
  - 初审：`/root/m24_code_audit/report.md`
  - 复审：`/root/m24_code_audit/recheck.md`
  - 最终结论：`Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-27T02:18:00+08:00

- Scope: M25 修复“Outlook 已连接但 triage/inbox 偶发空列表/超时”并上线独立邮箱查看窗口稳定版（实现 -> 子代理审计 -> 回修 -> 复审 -> 部署）。
- Task type: `Code + Deploy`
- Root cause verification:
  - 实测发现 `OUTLOOK_QUERY_EMAILS` 在当前 Outlook+Composio 组合下，当单次 `top` 过大时会出现“空列表假阴性”（例如 `limit=40` 可能返回 0）。
  - 导致主界面 `GET /api/mail/triage?limit=40` 与独立查看窗口的 `inbox/view` 出现“看起来没有邮件”问题，且用户侧误判为连接失败。
- Main changes:
- Backend `apps/bff/src/mail.ts`:
  - 新增分页拉取器 `queryInboxMessagesForSource`：
    - 使用 `top + skip` 分页读取（每页稳定窗口 35），可满足 `limit=40/60/100` 等更大请求。
    - 对空页增加一次小窗口 fallback（20）以规避上游空列表假阴性。
    - 增加去重与安全终止条件，避免分页重复/死循环。
  - 修复 fallback 分页终止判定：引入 `effectivePageTop`，避免 fallback 后误提前停止。
- Backend `apps/bff/src/server.ts`:
  - 给 `GET /api/mail/inbox/view` 增加专用限流（60/min，超限返回 `429 + Retry-After`），防止查看窗口被高频刷爆上游额度。
- Frontend `apps/webui/public/mailbox-viewer.html`:
  - 查看窗口默认读取 `limit=35`，并支持稳定查看列表+详情。
  - 增加外链安全：`webLink` 打开前做协议白名单校验（仅 `http/https`）。
  - 修复并发竞态：新增 inbox/detail request 序号门控，避免快速切源/切信导致旧响应覆盖新状态。
  - 增强错误可见性：`loadInbox` 增加统一 `try/catch` 与状态提示（含 `401` 指引）。
- Frontend `apps/webui/src/App.tsx`:
  - 主界面四象限默认拉取量调为 `35`；下拉选项收敛为 `[20, 30, 35]`。
  - 保留“打开邮箱查看窗口”入口，与 `/mailbox-viewer.html` 联动。
- Docs:
  - `README.md` 增补 `GET /api/mail/inbox/view` 说明与独立窗口说明。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 本地/线上烟测通过：
  - `POST /api/auth/login` -> `200`
  - `GET /api/mail/triage?limit=40` -> `200`，`total=40`
  - `GET /api/mail/triage?limit=60` -> `200`，`total=60`
  - `GET /api/mail/triage?limit=100` -> `200`，`total=100`
  - `GET /api/mail/inbox/view?limit=40` -> `200`，`total=40`
  - `GET /api/mail/inbox/view?limit=60` -> `200`，`total=60`
  - `inbox/view` 限流验证：第 61 次触发 `429 Too many inbox viewer requests`
- Deployment:
  - 前端静态资源已发布到 `/var/www/true-sight.asia`（`rsync --delete`）。
  - `openclaw-mail-bff.service` 已重启并保持 `active (running)`。
  - 线上可访问：`https://true-sight.asia/` 与 `https://true-sight.asia/mailbox-viewer.html`。
- Sub-agent audit findings:
  - 初审：`/root/m25_code_audit/report.md`
  - 复审：`/root/m25_code_audit/recheck.md`
  - 最终结论：`Backend Critical/High/Medium/Low = 0/0/0/1`，`Frontend Critical/High/Medium/Low = 0/0/0/0`
  - 剩余 Low（已记录）：空 inbox 时可能多一次 fallback 查询，属性能/配额优化项，不影响正确性与安全性。

### 2026-03-27T11:22:00+08:00

- Scope: M26 按产品需求调整 Outlook 登录交互（强制新窗口授权）并移除“邮箱登录下方手动填写框”。
- Task type: `Code + Deploy`
- Main changes:
- Frontend `apps/webui/src/App.tsx`:
  - `onLaunchOutlookAuthWindow` 改为“仅新开窗口 + 窗口内跳转 Composio 授权页”，移除当前页 `window.location.assign(...)` 覆盖行为。
  - 弹窗被拦截时改为显式报错提示（保留“打开授权页”链接作为用户手动兜底），不再自动覆盖当前窗口。
  - `onManageOutlookConnection` 的授权打开路径同步为新窗口策略，不再使用当前页跳转。
  - 删除“邮件登录区下方”手动创建源表单 UI（数据源标签 / Mailbox User ID / Composio Account ID 输入框）。
  - 授权结果按钮文案改为“复制 Composio Account ID”；复制逻辑加入兼容分支：优先 `navigator.clipboard.writeText`，不支持时回退 `execCommand("copy")`。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 前端已发布到 `/var/www/true-sight.asia`（`rsync --delete`）。
- `https://true-sight.asia/` 可访问（`200`）。
- Sub-agent audit findings:
  - 初审：`/root/m26_code_audit/report.md`（`Low=1`：clipboard 特性检测）
  - 修复后复审：`/root/m26_code_audit/recheck.md`
  - 最终结论：`Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-27T12:38:00+08:00

- Scope: M27 前端 UI 全量重构（仅前端，不改后端逻辑），接入 Tailwind 并改为高信息密度 Dashboard 风格。
- Task type: `Frontend UI + Deploy`
- Main changes:
- Frontend `apps/webui/src/App.tsx`:
  - 重写为单页高密度仪表盘结构（顶部账户区、邮件分类统计、截止日期列表、底部 AI 输入、底部导航）。
  - UI 文案按产品要求落地：
    - 高亮项：`紧急重要 / 来自：教务处 / 主题：期末考试安排 / 查看详情`
    - 次要项：`不紧急重要 / 来自：学生会 / 主题：活动报名`
    - DDL 列表默认示例：`项目报告截止(2天后)`、`会议安排(5天后)`
    - AI 输入占位：`询问邮件相关问题...`
  - 动效约束落地：
    - 列表项快速交错淡入（`stagger-fade`, 180ms）
    - 悬停仅背景色微变化（`hover:bg-zinc-50`）
    - AI 输入框 focus 仅边框颜色平滑过渡（`transition-colors`）
  - Outlook 登录保持“新开窗口授权”策略。
  - 修复审计问题：
    - 初始鉴权状态误判（先调 `/api/meta` 再进入 dashboard）
    - source fallback 对 disabled source 的误选
    - 关键输入增加 `aria-label`
- Frontend `apps/webui/src/styles.css`:
  - 改为 Tailwind 入口（`@import "tailwindcss"`）并新增 `stagger-fade` 动效工具类。
- Frontend `apps/webui/vite.config.ts`:
  - 接入 `@tailwindcss/vite` 插件。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 线上发布完成：`/var/www/true-sight.asia`（`rsync --delete`）
- 线上访问：`https://true-sight.asia/` -> `200`
- Sub-agent audit findings:
  - 初审：`/root/m27_code_audit/report.md`（`High=1, Medium=2, Low=1`）
  - 修复后复审：`/root/m27_code_audit/recheck.md`
  - 最终结论：`Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-27T13:45:26+08:00

- Scope: M27.1 全链路“每封邮件/事件中文 AI 摘要（OpenClaw）”上线收敛 + 安全稳定性加固 + 复审清零。
- Task type: `Backend + Frontend + Deploy + Audit`
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增并稳定化摘要增强链路：`/api/mail/triage`、`/api/mail/insights`、`/api/mail/inbox/view`、`/api/mail/message` 统一返回 `aiSummary`（简体中文）。
  - 摘要调用会话隔离改为 `session + source` 作用域，避免跨数据源上下文串扰。
  - 摘要解析改为严格 JSON schema（移除宽松 brace-slicing），并增加“忽略输入中潜在恶意指令”的 prompt 防护语义。
  - 加入摘要请求预算控制与熔断回退；最终修正为严格不超过 `remainingBudget` 的 per-call timeout。
  - 给高成本路由增加专用限流：`mail_triage` / `mail_insights` / `mail_message`。
  - 网关错误日志统一脱敏（不再记录上游原始 body/message）；`/api/mail/query` 错误日志去除 `question` 明文，仅记录长度。
- Backend `apps/bff/src/gateway.ts`:
  - `queryAgent` 新增 `timeoutMs` 透传，支持按摘要剩余预算做硬超时。
- Frontend `apps/webui/src/App.tsx`:
  - 强化外链白名单：邮件外链仅允许 `https + Outlook 官方域名`。
  - dashboard 刷新加入 request-seq 门控，修复并发旧响应回写。
  - source 选择使用 `enabled && ready`，并在 `412` fail-fast 时自动回退到安全源或清空视图。
  - 修复 fallback 二次拉取失败时旧摘要残留：回退拉取前先清空 `triage/insights`。
- Frontend `apps/webui/public/mailbox-viewer.html`:
  - 外链同样收敛为 Outlook 白名单。
  - 数据源下拉仅允许 `enabled && ready`。
  - `412` 回滚改为“先清空旧邮件/摘要 -> 刷新源快照 -> 自动重载可用源”。
- Docs:
  - `README.md` 已补充 `triage/insights/inbox/message` 返回 `aiSummary`（中文）说明。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 线上烟测（`https://true-sight.asia`）通过：
  - `POST /api/auth/login` -> `200`
  - `GET /api/mail/sources` -> `200`
  - `GET /api/mail/triage` -> `200`（`aiSummary` 命中）
  - `GET /api/mail/insights` -> `200`
  - `GET /api/mail/inbox/view` -> `200`（`aiSummary` 命中）
  - `GET /api/mail/message` -> `200`（`aiSummary` 命中）
- Deployment:
  - `openclaw-mail-bff.service` 已重启并保持 `active`。
  - 前端静态资源已同步到 `/var/www/true-sight.asia`（`rsync --delete`）。
- Sub-agent audit findings:
  - 本轮双子代理：`m27_backend_audit`、`m27_frontend_audit`
  - 初审发现的 Medium 项均已回修。
  - 最终复审结论：`Critical/High/Medium/Low = 0/0/0/0`（前后端均清零）。

### 2026-03-27T19:48:14+08:00

- Scope: 基于 M20+1 的生产部署。
- Task type: Build + Deploy
- Main changes:
- 执行全量构建: npm run build
- 前端静态资源发布: rsync --delete apps/webui/dist/ -> /var/www/true-sight.asia/
- 重启后端服务: systemctl restart openclaw-mail-bff.service
- Validation completed:
- BFF 健康检查: http://127.0.0.1:8787/live -> 200
- 线上页面: https://true-sight.asia/ -> 200
- 线上邮件页: https://true-sight.asia/mailbox-viewer.html -> 200
- Sub-agent audit findings:
  - 审计子代理: /root/deploy_verify_m20
  - 结论: HEAD=8de9191(M20+1), service=active, web checks=200




### 2026-03-27T20:25:56+08:00

- Scope: 修复 UI 授权异常与 Composio 上游错误可观测性（M28）。
- Task type: Backend + Frontend + Deploy + Audit
- Main changes:
- Backend:
  - 在 mail tool 解析链路中识别 Composio 上游纯文本错误，映射结构化错误码，避免原先的模糊 502 文案。
  - 对 Invalid consumer API key 统一返回 503，errorCode=COMPOSIO_CONSUMER_KEY_INVALID，并附带 fallback redirectUrl。
  - launch-auth 无 redirect 场景改为 fallback 到 COMPOSIO_PLATFORM_URL。
  - 新增专用 fallback URL 校验，仅允许 platform.composio.dev 或本地调试 host。
  - Gateway 错误兜底增强：除 errorCode 外，补充 message/error/detail 字段检测。
- Frontend:
  - 修复 Outlook 授权失败分支：弹窗被关闭时可重开并继续跳转授权页面。
  - 修复提示冲突：fallback 跳转成功后不再强制红色错误提示。
  - 发起新授权前清理旧 redirectUrl 和 connectedAccountId，避免状态串场。
- Config and Docs:
  - 新增环境变量 COMPOSIO_PLATFORM_URL（用于授权页 fallback）。
  - README 同步更新 launch-auth/fallback/consumer key 故障说明。
- Validation completed:
- npm run check passed.
- npm run build passed.
- Smoke tests:
  - https://true-sight.asia/ -> 200
  - https://true-sight.asia/mailbox-viewer.html -> 200
  - http://127.0.0.1:8787/live -> 200
  - POST /api/mail/connections/outlook/launch-auth -> 503 + COMPOSIO_CONSUMER_KEY_INVALID + redirectUrl
  - GET /api/mail/triage -> 503 + COMPOSIO_CONSUMER_KEY_INVALID + redirectUrl
- Deployment:
  - openclaw-mail-bff.service restarted and active.
  - Frontend assets synced to /var/www/true-sight.asia via rsync --delete.
- Sub-agent audit findings:
  - Backend audit: /root/m28_backend_audit (initial Medium/Low, recheck 0/0/0/0)
  - Frontend audit: /root/m28_frontend_audit (initial Medium/Low, recheck 0/0/0/0)

### 2026-03-27T21:18:40+08:00

- Scope: M28.1 稳定性加固（Composio 插件兼容 + 邮件响应解析抗形态漂移）并完成线上再部署。
- Task type: Backend + Plugin + Deploy + Audit
- Main changes:
- Backend `apps/bff/src/mail.ts`:
  - `COMPOSIO_MULTI_EXECUTE_TOOL` 文本解析增强：支持 code-fence JSON、字符串 JSON 多层反序列化。
  - `OUTLOOK_QUERY_EMAILS` 响应提取改为 BFS 深层扫描，兼容 `data/result/payload/body/response/result_data` 等多种嵌套形态。
  - 修复空数组误判与误命中非邮件数组：仅白名单键位允许空数组，根数组空结果受控放行。
  - 扩展鉴权错误识别：新增 `invalid api key / unauthorized...api key / missing authentication...api key` 归一匹配。
- Backend `apps/bff/src/server.ts`:
  - Composio key 识别规则同步扩展；统一返回结构化 `503 + COMPOSIO_CONSUMER_KEY_INVALID`。
  - 错误文案调整为通用 `auth key`，避免仅绑定 `consumerKey` 语义。
- Plugin `/root/.openclaw/extensions/composio`:
  - 新增配置：`apiKey`、`authHeader(auto|x-consumer-api-key|x-api-key|authorization)`。
  - `fetchToolsSync` 改为稳健 SSE 解析（按事件边界聚合多行 `data:` 并回溯最后可解析 JSON）。
  - 当 tools/list 失败时注册 fallback meta-tools（`COMPOSIO_*`），避免 BFF 侧出现 404 工具缺失。
  - 工具执行链路增加 MCP ready 超时（10s）并清理 timer，避免高并发下卡死/计时器泄漏。
  - `openclaw.plugin.json` 为 `authHeader` 增加 `enum` 约束；`config.ts` 对非法值显式报错。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Smoke tests:
  - `https://true-sight.asia/` -> 200
  - `https://true-sight.asia/mailbox-viewer.html` -> 200
  - `http://127.0.0.1:8787/live` -> 200
  - `POST /api/mail/connections/outlook/launch-auth` -> 503 + `COMPOSIO_CONSUMER_KEY_INVALID` + `redirectUrl`
  - `GET /api/mail/triage` -> 503 + `COMPOSIO_CONSUMER_KEY_INVALID`（不再退化为 404）
- Deployment:
  - `openclaw gateway restart` 完成（已加载插件新逻辑）。
  - `openclaw-mail-bff.service` 重启并保持 `active`。
  - 前端资源已同步到 `/var/www/true-sight.asia`（`rsync --delete`）。
- Sub-agent audit findings:
  - 初审：`m28_backend_audit` 给出 `0/1/3/1`（含空数组误判、SSE 解析、mcpReady 超时、schema 约束问题）。
  - 回修后复审：`Critical/High/Medium/Low = 0/0/0/0`。

### 2026-03-27T23:05:30+08:00

- Scope: M29 上线恢复（Composio 单工具 MCP 兼容、Outlook 一键授权弹窗闭环、错误语义与部署收口）。
- Task type: Backend + Plugin + Frontend + Deploy + Audit
- Main changes:
- Gateway Plugin `/root/.openclaw/extensions/composio`:
  - 将 Composio 配置切换为 `x-api-key + /v3/mcp/{serverId}/mcp?user_id=...`。
  - `src/config.ts`：`ak_` key 在 `auto` 模式下默认走 `x-api-key`。
  - `index.ts`：为 single-toolkit MCP 注入兼容 meta-tools（`COMPOSIO_MANAGE_CONNECTIONS/WAIT_FOR_CONNECTIONS/MULTI_EXECUTE_TOOL`）。
  - 兼容层新增 Outlook OAuth API 调用（自动创建 `auth_config`、发起 `connected_accounts`、返回 `redirect_url`）。
  - 安全加固：去除 `curl -L` 跨域重定向传密钥风险；`composio.dev` 域名匹配收紧；Composio REST 请求增加 12s 超时；避免覆盖已存在原生 `COMPOSIO_*` 工具执行器。
- BFF `/root/.openclaw/workspace/apps/bff/src`:
  - `mail.ts`：`COMPOSIO_MULTI_EXECUTE_TOOL` 失败时优先透传首个真实错误（不再只有 `1 out of 1 tools failed`）。
  - `server.ts`：新增 `OUTLOOK_CONNECTION_REQUIRED` 统一语义，未授权邮箱时返回 `412 + errorCode + redirectUrl`。
  - `server.ts`：`GatewayHttpError` 与非 Gateway 异常路径都统一映射 `OUTLOOK_CONNECTION_REQUIRED`。
  - `server.ts` 与 `mail.ts`：收紧 `COMPOSIO_CONSUMER_KEY_INVALID` 判定，避免把“未连接 Outlook”误判成 key 无效。
- Frontend `/root/.openclaw/workspace/apps/webui/src/App.tsx`:
  - 授权按钮继续保持“新开弹窗不覆盖原页”；成功与 fallback 跳转均注册 `focus -> refreshDashboard`。
  - 新增 `OUTLOOK_CONNECTION_REQUIRED` 用户友好提示。
  - 新增授权请求 `requestSeq` 防回写（登出后旧请求结果不会回填 UI）。
  - 新增 focus 监听清理（注册前清理、登出清理、组件卸载清理）。
  - 登出时清理 Outlook 授权状态（info/error/redirect/accountId/busy）。
- Runtime config:
  - `/root/.openclaw/openclaw.json` 的 composio config 已更新为：
    - `authHeader: x-api-key`
    - `mcpUrl: https://backend.composio.dev/v3/mcp/fd2312d4-04dc-460d-9acf-9d06998a2627/mcp?user_id=openclaw_mail_agent`
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Gateway logs:
  - Composio tools loaded: `Ready — 300 tools registered`
  - MCP client connected
- Smoke tests:
  - `POST /api/mail/connections/outlook/launch-auth` -> `200`，返回 `status=initiated + redirectUrl`
  - `GET /api/mail/triage`（未完成 OAuth）-> `412 OUTLOOK_CONNECTION_REQUIRED`
  - `GET /api/mail/insights`（未完成 OAuth）-> `412 OUTLOOK_CONNECTION_REQUIRED`
- Deployment:
  - `openclaw-gateway` restarted and active.
  - `openclaw-mail-bff.service` restarted and active.
  - Frontend assets synced to `/var/www/true-sight.asia` via `rsync --delete`.
- Sub-agent audit findings:
  - 初审：
    - backend `0/2/3/0`（重定向泄钥、compat 覆盖、错误判定/超时等）
    - frontend `0/0/2/1`（412 映射、fallback 刷新、logout 清理）
  - 回修后复审：
    - backend `0/0/0/0`
    - frontend `0/0/0/0`

### 2026-03-27T23:14:20+08:00

- Scope: M29.1 修复 Outlook 授权弹窗“误报被拦截”问题并再次部署。
- Task type: Frontend + Deploy + Audit
- Main changes:
- `apps/webui/src/App.tsx`:
  - 修复弹窗误判：不再因 `window.open` 句柄为空立即报“被拦截”；改为优先生成授权链接并尝试复用/重开弹窗，失败时提供“打开授权页”链接继续授权。
  - 新增 `openOutlookAuthPopup` helper，统一弹窗创建与安全处理。
  - 安全收口：若 `popup.opener = null` 失败，立即关闭弹窗并回退链接模式，避免潜在 opener 风险。
  - 统一文案：提示与入口统一为“打开授权页”。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 前端资源已同步至 `/var/www/true-sight.asia`，线上入口引用已更新为 `index-DAwoEJYx.js`。
- Sub-agent audit findings:
  - 复审：`m28_frontend_audit`
  - 最终结论：`Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-27T23:33:20+08:00

- Scope: M29.2 修复“已连接后再次点登录导致反复重授权/看似未连接”问题。
- Task type: Backend + Frontend + Deploy + Audit
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - `POST /api/mail/connections/outlook/launch-auth` 不再默认 `reinitiate_all=true`（避免每次点击都重置授权态）。
  - 若当前连接已 `active`（或 `hasActiveConnection=true`），直接返回成功且 `needsUserAction=false`，不再要求再次 OAuth。
- Frontend `apps/webui/src/App.tsx`:
  - 登录 Outlook 响应若为 `active`，直接提示“已连接，无需重复授权”并刷新数据。
  - 修复 active 分支残留授权链接的低优先级 UX 问题（active 时清空 `outlookRedirectUrl`）。
- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 线上验证：
  - `launch-auth` 返回 `status=active, hasActiveConnection=true, redirectUrl=null`
  - `triage` 返回 `200`（不再 412）
- Deployment:
  - `openclaw-mail-bff.service` 重启并 active。
  - 前端资源同步到 `/var/www/true-sight.asia`，入口更新为 `index-CiVm60nO.js`。
- Sub-agent audit findings:
  - backend 复审：`0/0/0/0`
  - frontend 初审：`0/0/0/1`（active 分支链接残留）
  - 回修后 frontend 复审：`0/0/0/0`

### 2026-03-28T02:03:22+08:00

- Scope: M30 前端可达性修复 + OAuth 弹窗链路重构 + 现代化 UI 重做 + 线上部署。
- Task type: Frontend + Backend + Deploy + Sub-agent Audit
- Main changes:
- Frontend `apps/webui/src/App.tsx`:
  - 修复“统计/日历/设置进不去”：将底部/侧边导航改为真实可切换视图（`inbox/stats/calendar/settings`），并完成对应内容面板。
  - 完整重做 UI：新布局改为 `left nav + main workspace + right assistant rail`，移动端保留底部导航；视觉改为现代化玻璃面板与高信息密度布局。
  - OAuth 授权改为安全桥接页模式：`登录 Outlook` 按钮打开 `outlook-auth-bridge.html` 新窗口，桥接页再调用 BFF `launch-auth` 并跳转 Composio；主页面不再直接驱动第三方授权 URL。
  - 弹窗安全加固：`window.open(..., noopener,noreferrer)`，消除 `window.opener` 风险。
  - 401 统一收敛：新增 `handleUnauthorizedError`，在设置/问答/日历等非 dashboard 操作触发会话过期时统一回到登录态。
  - 412 Fail-fast 闭环：数据源失效时自动尝试回滚到可用源；无可用源时清空视图并给出可执行提示。
  - 运行时契约校验：为 `sources/triage/insights/query/calendar` 等关键响应增加 shape 校验与 normalize，避免 UI 因后端字段漂移崩溃。
  - 错误文案优化：新增 502/503/504 用户可读提示。
- Frontend `apps/webui/src/styles.css`:
  - 更新字体与视觉变量（Manrope + JetBrains Mono）。
  - 新增 `app-bg/glass-panel` 风格体系；移除全局 `outline-none`，保留可访问焦点样式。
- Frontend static `apps/webui/public/outlook-auth-bridge.html`:
  - 新增 Outlook 授权桥接页：负责发起 `/api/mail/connections/outlook/launch-auth` 并安全跳转；支持 401/失败态提示与手动授权链接回退。
- Backend `apps/bff/src/server.ts`:
  - 新增 `GET /api/auth/session`（公开、只读会话状态）。
  - `onRequest` 白名单新增 `/api/auth/session`，避免其被 `/api/*` 统一鉴权拦截。
  - 会话状态路由改为只读校验（不续期），并增加限流与缓存控制响应头：`Cache-Control: private, no-store` / `Pragma: no-cache` / `Vary: Cookie`。

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 线上 smoke:
  - `https://true-sight.asia/` -> 200
  - `https://true-sight.asia/outlook-auth-bridge.html` -> 200
  - `GET /api/auth/session`（未登录）-> `{"ok":true,"authenticated":false}`
  - 登录后 `GET /api/auth/session` -> `{"ok":true,"authenticated":true}`
  - 登录后 `GET /api/mail/sources` -> 200
  - 登录后 `GET /api/mail/triage?limit=10&sourceId=default_outlook` -> 200

- Deployment:
- 前端静态资源已同步到 `/var/www/true-sight.asia`（含新桥接页 `outlook-auth-bridge.html`）。
- `openclaw-mail-bff.service` 已重启并 `active`。
- `nginx` 已重启并 `active`。

- Sub-agent audit findings:
- 初审发现：
  - frontend `High`: popup opener 风险；`Medium`: 401 非统一处理/响应形态浅校验等。
  - backend `Medium`: `/session` 路由会话续期语义与潜在放大点。
- 回修后复审：
  - frontend `Critical/High/Medium/Low = 0/0/0/0`
  - backend `Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-28T02:25:21+08:00

- Scope: M30.1 授权现象解释对应修复（已连接不跳转 + 未绑定邮箱显示）与强制重授权能力。
- Task type: Backend + Frontend + Deploy + Sub-agent Audit
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - `POST /api/mail/connections/outlook/launch-auth` 新增 `forceReinitiate` 入参（可选）。
  - 强制重授权仅在存在已记录 `sessionId` 时启用 `reinitiate_all`，避免无 session 时语义回归。
  - `launch-auth` body 兼容非对象输入（按 `{}` 处理），避免历史调用兼容性问题。
  - 默认 source hint 逻辑收敛：仅采纳 `mailboxUserId` 且截断到 120；不再把 `connectedAccountId` 注入 `emailHint` 展示。
  - 默认 hint 清理策略改为“本次无有效 hint 就清理”，避免 stale 提示。
- Frontend `apps/webui/public/outlook-auth-bridge.html`:
  - 桥接页支持 `forceReinitiate=1`，可在“已连接”状态下触发真正 Composio 授权跳转。
  - 已连接时文案改为解释型：默认提示“无需重复授权”，并提供“重新授权 Outlook”按钮。
  - 删除硬编码 `https://platform.composio.dev/` 回退，避免私有 workspace 跳错站点。
  - 去掉手动链接 `target=_blank`，保持同窗口流程连续。
- Frontend `apps/webui/src/App.tsx`:
  - 顶部“当前邮箱”在 ready 但无邮箱标识时改为：`Outlook（已连接，邮箱标识未返回）`，避免误显示 source label。

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- 线上 smoke:
  - `launch-auth` 默认调用 -> `status=active, redirectUrl=null`
  - `launch-auth(forceReinitiate=true)` -> `status=initiated, redirectUrl=<composio url>, wasReinitiated=true`
  - `/api/mail/sources` 正常返回；`default_outlook` 仍可读邮件。

- Deployment:
- 前端静态资源已重新同步到 `/var/www/true-sight.asia`。
- `openclaw-mail-bff.service` 已重启并 `active`。

- Sub-agent audit findings:
- 初审：
  - frontend: `Medium=2, Low=1`（平台地址硬编码、邮箱展示误导、重授权新开页）
  - backend: `Medium=1, Low=3`（forceReinitiate session 语义、hint/兼容性细节）
- 回修后复审：
  - frontend `Critical/High/Medium/Low = 0/0/0/0`
  - backend `Critical/High/Medium/Low = 0/0/0/0`

### 2026-03-28T03:03:18+08:00

- Scope: M31.1 认证体系对接（website-login-main 契约并入主工程）+ 审计回修 + 迭代复测。
- Task type: Backend + Frontend + QA + Audit
- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增账号认证接口：
    - `POST /api/auth/register`（`email + username + password`）
    - `POST /api/auth/login`（`email + password + remember`）
    - `GET /api/auth/me`（未登录返回 `204`）
    - `GET /api/auth/session` 扩展返回可选 `user`
  - 保留 legacy 兼容：`POST /api/auth/login` 仍支持 `apiKey` 登录（兼容旧链路）。
  - `onRequest` 免鉴权白名单补充：`/api/auth/register`、`/api/auth/me`。
  - 审计回修：
    - 修复“成功登录重置 IP 限流”问题（移除成功路径 `loginAttempts.delete(ip)`，避免可持续撞库窗口）。
    - `/api/auth/me` 在“token 有效但 user 缺失”时改为 `clearSessionState(token)`，不再仅清 Cookie。
    - `/api/auth/me` 增加 `no-store` 缓存头（与 `/api/auth/session` 一致）。
- Frontend `apps/webui/src/App.tsx`:
  - 登录页从 API Key 模式升级为“登录/注册双模式”，对接新后端契约：
    - 登录：邮箱、密码、记住我
    - 注册：邮箱、昵称、密码、确认密码
    - 支持 `zh/en` 切换（认证页）
  - 新增会话用户态展示：顶栏显示当前账号（displayName/email）。
  - 审计回修：
    - 增加 `clearUserScopedInputs()`，在 `logout` 与 `401` 统一清理用户输入，修复跨账号残留风险。
    - 会话探测失败新增可重试提示，不再把暂时性错误直接当作“明确未登录”。
    - 401 提示国际化（EN 不再固定中文）。
    - Outlook 授权并发收敛：
      - 已开授权窗时复用同窗（不重复拉起）
      - `outlookBusy` 改为超时/焦点回流/桥接消息驱动结束，不再点击即立刻复位。
  - 新增授权结果通道：监听 `BroadcastChannel('true-sight-outlook-auth')`。
- Frontend static `apps/webui/public/outlook-auth-bridge.html`:
  - 新增 `BroadcastChannel` 消息回传（`booting/ready/redirecting/active/failed`），把桥接页状态反馈给主页面。
- Docs:
  - `README.md` 认证章节更新为账号体系，并标注 api-key 登录为 legacy compatibility。

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- API smoke matrix（隔离端口多轮）：
  - 认证：`register=201`、`login bad=401`、`login ok=200`、`session=200`、`me=200`、`logout=200`
  - 邮件主链路：`sources/triage/insights/query/notifications/preferences/launch-auth` 全部 `200`
  - 日历负载校验：`/calendar/sync|delete|batch` 非法 payload 返回 `400`
  - SSE：`/api/mail/notifications/stream` 可收到 `notification` 事件
- 审计回修验证：
  - 限流不重置：`register + 27 bad + 1 good + 2 bad` 下，第二个 bad 触发 `429`
  - legacy token 清理：`apiKey login -> /api/auth/me(204) -> /api/meta(401)`
  - `/api/auth/me` 响应头：`Cache-Control: private, no-store, max-age=0`

- Sub-agent audit findings:
- Frontend audit（agent `Aristotle`）初审：`High=1, Medium=2, Low=1`（跨账号残留、会话探测误伤、Outlook 并发与回传、401 文案）。
- Backend audit（agent `Pasteur`）初审：`High=2, Medium=3, Low=1`。
- 本轮已回修并验证的项：
  - High：登录成功重置限流（已修）
  - Medium：`/api/auth/me` 会话残留（已修）
  - Low：`/api/auth/me` 缓存头缺失（已修）
  - Frontend High/Medium 关键项（状态清理、会话探测重试、授权并发与消息回传）已修
- 暂未在本轮落地的架构项（已记录为 M31.2）：
  - 认证用户/会话仍为进程内存（需 PostgreSQL + Redis 持久化）
  - 账户枚举与时序侧信道进一步收敛（统一响应 + dummy hash）
  - 同步 KDF 改异步（降低事件循环阻塞风险）

### 2026-03-28T12:42:00+08:00

- Scope: M31.2 收口（认证持久化适配后续 + 授权桥竞态加固 + 线上再部署）。
- Task type: Backend + Frontend + Deploy + QA

- Main changes:
- Backend `apps/bff/src/server.ts`:
  - Auth error code 扩展：新增 `AUTH_STORE_UNAVAILABLE`，认证存储异常统一返回受控 `503`。
  - 新增 auth-store 异常封装：`AuthStoreUnavailableError`，Prisma 读写失败不再向客户端透传内部错误文本。
  - 会话语义修正：
    - 新增 `sessionTtlMsByToken`，`touchSessionIfActive()` 按会话原始 TTL 续期，修复 remember 会话被短 TTL 覆盖问题。
    - 新增 legacy 会话标记 `legacyApiKeySessions`；`/api/auth/me` 对 legacy 会话返回 `204` 不再误清会话。
    - 抽象 `establishSession()` 统一写入 session/ttl/user/legacy 元信息。
- Frontend `apps/webui/src/App.tsx`:
  - Outlook 授权通道继续收敛：BroadcastChannel 消息要求 `attemptId + sessionEpoch` 同时匹配，忽略旧流/串线消息。
  - Busy 解锁仅允许当前 attempt 的 terminal 状态触发，降低 stale message 误解锁风险。
  - 登录/注册成功与失败路径均清理密码输入（`authPassword/registerConfirmPassword`）。
  - 会话边界（logout/401）统一 `epoch+attempt` 清理，避免旧授权消息污染新会话。
- Frontend bridge `apps/webui/public/outlook-auth-bridge.html`:
  - `forceReinitiate` 手动链接改为保留 `attemptId/sessionEpoch` 参数，避免重授权分支丢失消息绑定上下文。

- Validation completed:
- Local:
  - `npm run check` passed.
  - `npm run build` passed.
- Production smoke (`https://true-sight.asia`):
  - `GET /` -> `200`
  - `GET /outlook-auth-bridge.html` -> `200`
  - `GET /api/auth/session` -> `200`
  - `GET /api/meta` (unauth) -> `401`
  - `POST /api/auth/register` -> `201`
  - `GET /api/auth/me` -> `200`
  - `POST /api/mail/connections/outlook/launch-auth` -> `200` (`status=active`)
  - `GET /api/mail/triage?limit=10&sourceId=default_outlook` -> `200`（可返回真实邮件）
  - `POST /api/auth/logout` -> `200`
  - `GET /api/auth/me`（after logout）-> `204`

- Deployment:
- 前端静态资源已同步到 `/var/www/true-sight.asia`。
- `openclaw-mail-bff.service` 已重启并确认 `active`。

- Audit note:
- 本轮按前后端安全/竞态清单完成复核与回归，当前未发现新增 Critical/High 问题。

### 2026-03-28T12:41:00+08:00

- Scope: M31.2 认证与授权链路收口（回归修复 + 线上重部署 + 实测验证）。
- Task type: Backend + Frontend + Deploy + QA

- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 会话元信息补全：新增 `sessionTtlMsByToken` 与 `establishSession()`，`touchSessionIfActive()` 改为按会话原始 TTL 续期，避免 remember 长会话被 `SESSION_TTL_MS` 覆盖。
  - legacy 会话语义修正：新增 `legacyApiKeySessions`，`/api/auth/me` 对 legacy token 返回 `204` 但不清会话，避免兼容登录链路被误杀。
  - 认证存储错误收敛：Prisma 读写异常封装为 `AuthStoreUnavailableError`，认证接口返回受控 `503`（`AUTH_STORE_UNAVAILABLE`），不再透传内部错误文本。
- Frontend `apps/webui/src/App.tsx`:
  - Outlook 授权桥消息门控：BroadcastChannel 仅接受 `attemptId + sessionEpoch` 同时匹配的消息，旧会话/旧流程消息不再污染当前状态。
  - 授权 busy 状态收敛：仅当前 attempt 的终态消息可解锁 busy；logout/401 路径统一清理 epoch 与 attempt。
  - 登录/注册密码清理：成功与失败路径均清空密码输入，降低敏感信息驻留时间。
- Frontend bridge `apps/webui/public/outlook-auth-bridge.html`:
  - 授权桥统一回传 `attemptId/sessionEpoch`；重授权链接保留绑定参数，避免分支丢失上下文。

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Production smoke (`https://true-sight.asia`):
  - `GET /` -> `200`
  - `GET /outlook-auth-bridge.html` -> `200`
  - `POST /api/auth/register` -> `201`
  - `GET /api/auth/session` -> `200`
  - `GET /api/meta` (auth) -> `200`
  - `GET /api/mail/sources` -> `200`
  - `POST /api/mail/connections/outlook/launch-auth` -> `200` (`status=active`)
  - `GET /api/mail/triage?limit=8&sourceId=default_outlook` -> `200`
  - `GET /api/mail/insights?...&sourceId=default_outlook` -> `200`
  - `POST /api/auth/logout` -> `200`
  - `GET /api/meta`（after logout）-> `401`
- Legacy compatibility smoke:
  - `POST /api/auth/login` (apiKey) -> `200`
  - `GET /api/auth/me` -> `204`
  - `GET /api/meta`（after /me）-> `200`（确认 legacy 会话未被误清理）

- Deployment:
- 前端静态资源已同步至 `/var/www/true-sight.asia`。
- `openclaw-mail-bff.service` 已重启并确认 `active`。

- Audit note:
- 本轮按认证与授权相关风险清单完成复核，未发现新增 Critical/High 问题。

### 2026-03-28T13:30:00+08:00

- Scope: M31.2 持续收口（主工作区复核 + 子代理复审 + 线上再部署确认）。
- Task type: Backend + Frontend + Audit + Deploy + QA

- Main changes (confirmed in main workspace):
- Backend `apps/bff/src/server.ts`:
  - 认证存储异常统一受控返回 `503`（`AUTH_STORE_UNAVAILABLE`），避免内部错误透传。
  - 会话续期改为按会话自身 TTL（通过 `sessionTtlMsByToken`），修复 remember 会话被短 TTL 覆盖。
  - legacy API key 会话与 `/api/auth/me` 语义解耦：legacy 会话 `/me=204` 且不误清会话。
  - 统一 `establishSession()` 写入会话元信息（ttl/user/legacy）。
- Frontend `apps/webui/src/App.tsx`:
  - Outlook 授权消息双门控：`attemptId + sessionEpoch` 必须匹配当前会话与当前授权尝试。
  - 仅当前 attempt 的终态消息可结束 busy，降低 stale message 串线解锁风险。
  - 登录/注册成功与失败路径均清理密码输入。
- Bridge `apps/webui/public/outlook-auth-bridge.html`:
  - 广播消息携带 `attemptId/sessionEpoch`，并在重授权链接保留绑定参数。

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Production smoke (`https://true-sight.asia`):
  - `GET /` -> `200`
  - `GET /outlook-auth-bridge.html` -> `200`
  - `POST /api/auth/register` -> `201`
  - `GET /api/auth/me` -> `200`
  - `GET /api/auth/session` -> `200`
  - `POST /api/mail/connections/outlook/launch-auth` -> `200`
  - `GET /api/mail/triage?...sourceId=default_outlook` -> `200`
  - `GET /api/mail/insights?...sourceId=default_outlook` -> `200`
  - `POST /api/auth/logout` -> `200`
  - `GET /api/auth/me` (after logout) -> `204`
- Legacy compatibility smoke:
  - `POST /api/auth/login` (apiKey) -> `200`
  - `GET /api/auth/me` -> `204`
  - `GET /api/meta` -> `200`（确认 legacy 会话未被 `/me` 误清）

- Sub-agent audit:
- Frontend audit agent `Noether`：复审未报 Critical/High。
- Backend audit agent `Dalton`：复审未报 Critical/High。

- Deployment:
- 前端静态资源已 `rsync` 到 `/var/www/true-sight.asia/`。
- `openclaw-mail-bff.service` 已重启并确认 `active`。

### 2026-03-28T13:25:00+08:00

- Scope: M31.3（Redis 会话持久化）上线收口。
- Task type: Backend + Infra + Deploy + QA

- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增 Redis 会话回填：内存未命中时按 token 从 Redis hydrate，会话可跨 BFF 重启继续使用。
  - 会话写入/续期同步 Redis（`establishSession`、`touchSessionIfActive`）。
  - 会话删除一致性增强：`/api/auth/logout` 与失效清理路径补充 Redis 删除，避免“已登出但 Redis 尚未删”造成短时复活。
  - 增加 recently-cleared token 门控，阻断 stale Redis 记录被立即回填的竞态。
  - `/api/auth/session`、`/api/auth/me` 增加 session-level user view 回退，配合 Redis 持久化在 `PRISMA_AUTH_ENABLED=false` 时也可跨重启维持当前登录态。
  - 去除会话 token 片段日志，降低敏感信息暴露面。
- Backend new file `apps/bff/src/redis-session-store.ts`:
  - 新增 Redis 会话存储抽象（`enabled/load/save/remove/close`），含初始化探活、容错回退到内存、JSON 结构校验。
- Config/env:
  - `apps/bff/src/config.ts` 新增 Redis 相关配置项。
  - `apps/bff/.env.example` 补充 `REDIS_AUTH_SESSIONS_ENABLED/REDIS_URL/REDIS_KEY_PREFIX/REDIS_CONNECT_TIMEOUT_MS`。
  - 生产 `.env` 已启用 Redis 会话持久化。
- Infra:
  - 安装并启用 `redis-server`（systemd），`redis-cli ping -> PONG`。
- Docs:
  - `README.md` 更新 M31.3 使用说明与部署运行时说明。

- Validation completed:
- Build/Typecheck:
  - `npm run check` passed.
  - `npm run build` passed.
- Runtime smoke (`https://true-sight.asia`):
  - 常规链路：`register=201`、`/api/auth/me=200`、`/api/auth/session=200`、`/api/meta=200`、`triage=200`。
  - 会话跨重启：登录后重启 `openclaw-mail-bff.service`，同 cookie 下 `/api/auth/session=200`、`/api/auth/me=200`、`/api/meta=200`、`triage=200`。
  - 登出一致性：`/api/auth/logout=200` 后立即 `/api/meta=401`（无短时复活）。
  - legacy 回归：`apiKey login=200`、`/api/auth/me=204`、重启后 `/api/meta=200`、logout 后 `/api/meta=401`。

- Deployment:
- BFF 已重启并确认 `active`。
- 前端静态资源已再次同步至 `/var/www/true-sight.asia/`。

- Audit note:
- 本轮围绕会话生命周期、Redis 故障回退、日志敏感信息、legacy 兼容和删除竞态做了定向审计与回归，未发现新增 Critical/High 未收敛项。

### 2026-03-28T13:40:00+08:00

- Scope: M31.3 复核收口（Redis 会话持久化二次验收 + 子代理审计）。
- Task type: Backend + Infra + QA + Audit

- Main updates:
- Confirmed Redis session persistence integration and runtime enablement:
  - Session store bootstrap: `createRedisAuthSessionStore()`  
    (`apps/bff/src/server.ts`, `apps/bff/src/redis-session-store.ts`)
  - Session hydrate on request/auth endpoints and Redis sync on establish/touch/clear paths.
  - Recently-cleared token gate remains active to prevent stale Redis re-hydration race.
  - Session-level `user` snapshot fallback validated for `/api/auth/session` and `/api/auth/me` when Prisma user store is disabled.
- Infra:
  - Installed and enabled `redis-server` (systemd), `redis-cli ping = PONG`.
  - Production BFF `.env` enabled:
    - `REDIS_AUTH_SESSIONS_ENABLED=true`
    - `REDIS_URL=redis://127.0.0.1:6379`
    - `REDIS_KEY_PREFIX=true_sight:bff`
    - `REDIS_CONNECT_TIMEOUT_MS=3000`

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Production smoke (`https://true-sight.asia`):
  - `home=200`, `bridge=200`, `register=201`, `session=200`, `me=200`, `launch-auth=200`, `triage=200`, `insights=200`, `logout=200`, `meta_after=401`.
- Restart persistence verification:
  - Login -> restart `openclaw-mail-bff.service` -> `/api/auth/session=200` `/api/auth/me=200` `/api/meta=200` `/api/mail/triage=200`.

- Sub-agent audit:
- Backend audit agent `Heisenberg` completed targeted review for Redis session lifecycle/security paths.
- Result: no newly introduced Critical/High items requiring additional patch in this round.

### 2026-03-28T13:55:00+08:00

- Scope: M31.4 最终收口（审计问题回填 + 再部署 + 再验证）。
- Task type: Backend + Security hardening + Deploy + QA

- Audit-driven fixes completed:
- Fixed previous `High` logout-revival race with Redis tombstone strategy:
  - Save path now checks tombstone and refuses stale writeback.
  - Hydrate path checks tombstone before loading session key.
  - Logout/clear path writes tombstone + deletes session key.
- Fixed previous `Medium` fail-open in Prisma auth init:
  - `PRISMA_AUTH_ENABLED=true` now fail-closed on missing/failed DB init (startup error).
- Fixed previous `Medium` identity fallback behavior under Prisma mode:
  - `/api/auth/session` and `/api/auth/me` only use session user-view fallback when Prisma auth store is disabled.
  - When Prisma is enabled and DB user is missing, session is invalidated.
- Fixed previous `Low` tombstone TTL behavior:
  - Tombstone TTL now uses per-session effective TTL (captured before clear), not fixed 30-day value.
- Added strict logout cleanup behavior:
  - On Redis logout-state persistence failure, `/api/auth/logout` returns `503 SESSION_CLEANUP_FAILED` (cookie still cleared).

- Validation completed:
- `npm run check` passed.
- `npm run build` passed.
- Production smoke (`https://true-sight.asia`):
  - `register=201`, `logout=200`, `meta_after_logout=401`, `meta_after_restart=401`
  - credential re-login after restart remains valid (`login=200`, `me=200`, `triage=200`)
- Service status:
  - `openclaw-mail-bff.service = active`
  - `redis-server = active`
  - `postgresql = active`

- Sub-agent re-audit closure:
- Initial recheck showed `Critical=0, High=0, Medium=1, Low=1`.
- This round implemented both remaining `Medium/Low` suggestions.
- Final status for addressed findings: all closed in code and validated by smoke tests.

### 2026-03-28T14:10:15+08:00

- Scope: M32.1（i18n 第一阶段：摘要语言动态化）+ 审计回修闭环。
- Task type: Backend + Frontend + Deploy + QA + Audit

- Main changes:
- Backend `apps/bff/src/server.ts`:
  - 新增请求级摘要语言解析：优先 `x-true-sight-locale`，回退 `Accept-Language`（按 `q` 权重），默认 `zh-CN`。
  - 摘要缓存与会话隔离加入 `locale` 维度（cache key / ai-summary session key），避免中英文摘要互串。
  - OpenClaw 摘要 prompt 改为多语言模板（`zh-CN/en-US/ja-JP`）。
  - Fallback 摘要改为按 locale 输出（邮件/事项两类）。
  - JSON 解析链路增强：从输出文本中提取首个合法 JSON 对象，不再要求“整段纯 JSON”。
  - 新增 parse-fallback 告警日志（含 `sourceId/locale/chunkSize`），便于观测摘要退化。
  - 安全收紧：不再信任 `x-user-locale`，并对重复/拼接 locale header 做保守处理。
- Frontend `apps/webui/src/App.tsx`:
  - 所有 `fetchJson` 请求统一注入 `x-true-sight-locale`。
  - 修复 header 合并顺序问题：改为 `new Headers(init?.headers)` 后再覆盖 locale，避免 `init` 覆盖默认头。
  - 登录后页头增加语言切换（中文/EN），可直接影响摘要语言而无需退出。
- Docs:
  - `README.md` 更新摘要 locale 行为说明与支持语言。

- Validation completed:
- Build/Typecheck:
  - `npm run check` passed.
  - `npm run build` passed.
- Production smoke (`https://true-sight.asia`):
  - `login=200`, `meta=200`, `triage_en=200`, `triage_zh=200`, `triage_accept=200`, `logout=200`, `meta_after=401`.
  - 摘要样例验证：`en-US` 返回英文句式；`zh-CN` 返回中文句式；`Accept-Language` 英文优先时返回英文摘要。

- Deployment:
- 前端静态资源已同步到 `/var/www/true-sight.asia/`。
- `openclaw-mail-bff.service` 已重启并确认 `active`。

- Sub-agent audit:
- 初审报告：`/root/m32_1_code_audit/report.md`（Medium=2, Low=1）。
- 回修后复审：`/root/m32_1_code_audit/recheck.md`（Critical/High/Medium/Low=0/0/0/0）。
