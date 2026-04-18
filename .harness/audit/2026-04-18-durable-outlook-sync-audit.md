# Durable Outlook Sync Audit

- Timestamp: 2026-04-18T19:35:50+08:00
- Reviewer: Codex independent audit
- Scope: `apps/bff/src/server.ts`, `apps/bff/src/microsoft-graph.ts`, `apps/bff/src/mail-source-service.ts`, `apps/bff/src/outlook-sync-store.ts`, `apps/bff/src/runtime/json-file-store.ts`
- Reviewer note: Code-review audit only. I did not change app logic, and I did not find dedicated automated coverage for the new durable Outlook sync path.

## Findings

### High

1. **Stale-state writeback can erase a freshly created subscription or delta checkpoint**
   - Evidence: `apps/bff/src/server.ts:4953-4955` updates `nextState` with the latest subscription + delta state, but the `catch` path at `apps/bff/src/server.ts:4990-5003` persists `{ ...state, lastError }` from the original function input instead of the newest in-memory state.
   - Why it matters: if subscription creation/renewal succeeds and a later step fails, the error handler can write the old `subscriptionId`, `subscriptionExpirationDateTime`, `deltaLink`, `nextDeltaLink`, and `dirtyReason` back over the new values. That can force needless subscription recreation, lose delta progress, and cause repeated duplicate processing on later sweeps.

2. **The durable worker uses a synthetic session token, but downstream helpers still depend on session-scoped source state**
   - Evidence:
     - `apps/bff/src/server.ts:4644-4697` manufactures a `durable:*` session token in `buildDurableTenantContext`.
     - `apps/bff/src/server.ts:3329-3354` builds source context only from `mailSourcesBySession` / `sourceRoutingStatusBySession`.
     - `apps/bff/src/server.ts:4120-4135` notification polling resolves the source from the session-scoped snapshot before it can run.
     - `apps/bff/src/server.ts:4337-4367` auto calendar sync still calls `runCalendarSyncWithDedupe(sessionToken, sourceId, ...)`, which rebuilds source context from that same session state.
   - Why it matters: durable background runs do not hydrate a real session snapshot for the synthetic token, so notification polling falls into `MAIL_SOURCE_NOT_FOUND`, auto calendar sync loses the direct Microsoft context, and session-scoped priority rules / notification preferences are silently ignored. The durable path therefore does not actually preserve parity with the normal Outlook-processing path.

### Medium

3. **Webhook notifications are accepted even when `clientState` is missing**
   - Evidence: `apps/bff/src/server.ts:7643-7648` only rejects the notification when both sides have `clientState` and they differ. If the stored subscription has a `clientState` but the inbound payload omits it, the request is still accepted and queued.
   - Why it matters: this webhook is intentionally public. Requiring an exact `clientState` match whenever one was configured is the main request-authenticity check here. Accepting a missing value weakens that guard and allows forged notifications with a known `subscriptionId` to mark a source dirty and trigger background work.

## Validation Gaps

- I did not find durable-sync-specific automated coverage for:
  - subscription creation / renewal failure handling
  - webhook lifecycle events (`missed`, `reauthorizationRequired`, `subscriptionRemoved`)
  - restart recovery of the file-backed durable stores

## Final Status

Findings: 2 High, 1 Medium
