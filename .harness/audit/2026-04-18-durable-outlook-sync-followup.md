# Durable Outlook Sync Follow-Up Audit

- Timestamp: 2026-04-18T20:18:40+08:00
- Task type: Code
- Scope: `apps/bff/src/server.ts`, `apps/bff/src/outlook-sync-store.ts`
- Implementer: Codex main session
- Audit tools/models: Codex sub-agents `Lorentz` and `Hubble`

## Fixes After Audit

- Replaced stale durable runtime writeback with guarded merge semantics so rebind/disable state cannot be overwritten by an older worker snapshot.
- Reset durable Outlook state when a source is rebound to a different `microsoftAccountId` or `mailboxUserId`, including best-effort cleanup of the previous subscription.
- Tightened webhook handling so notifications are accepted only when the live stored subscription is enabled, binding-matched, has a `clientState`, and the inbound `clientState` matches.
- Changed webhook writes to use `updateOutlookSyncState()` with live revalidation instead of saving a stale snapshot.
- Added durable mutation locking for source update/delete so source mutations cannot overlap with side-effecting durable processing.
- Made mutation lock acquisition atomic and prevented stale background source snapshots from re-enabling disabled durable sync state.
- Prevented background `allowBindingReset:false` upserts from overwriting a newer binding or resurrecting disabled state.
- Preserved newer webhook lifecycle state during older runtime saves so `missed`, `reauthorizationRequired`, and `subscriptionRemoved` states are not lost.
- Moved calendar dedupe scoping from session token to user/source when a user context is available, aligning foreground and durable background paths in one BFF process.
- Stored a durable source timezone hint so background processing no longer always falls back to the server timezone after a foreground session has provided one.

## Final Sub-Agent Audit Result

Final `Hubble` audit result:

> No Critical/High findings remain in the current `server.ts` and `outlook-sync-store.ts`.
>
> Re-checked durable Outlook sync locking, source rebind/disable/delete mutation windows, stale background snapshots with `allowBindingReset:false`, webhook `clientState` acceptance, webhook-preserving runtime merges, stale writeback guards, and calendar dedupe scoping. No remaining Critical/High regressions found.

## Deferred Medium/Low Risks

- Medium: calendar sync dedupe is still process-local and not durable across BFF restarts or multi-instance deployment.
  - Rationale: this needs a durable dedupe table/store and belongs with the future Prisma/Redis deployment pass the user explicitly deferred.
  - Owner: backend/deployment.
  - Target date: 2026-04-25.
- Medium: custom priority rules are still session-scoped, so durable background classification may not apply foreground-only custom rules.
  - Rationale: durable rule parity requires persisting user/source rules, which is a separate product storage task beyond the sync race fixes.
  - Owner: backend/product.
  - Target date: 2026-04-25.

## Validation

- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/bff run build` passed.
- `git diff --check` passed.
- Local BFF restarted from `apps/bff/dist/server.js`.
- `curl -sS http://127.0.0.1:8787/health` returned `llm.ok=true`, `microsoft.ok=true`, and `outlookSync.ok=true`; `prisma.ok=false` remains intentionally deferred for deployment.
