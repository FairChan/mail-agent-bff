# 2026-04-18 KB Source-Pinned Docs And Summary Audit

- Task type: Code
- Timestamp: 2026-04-18T17:03:56+08:00
- Implementer: Codex main session
- Audit method: independent sub-agents plus targeted validation

## Changed Surface

- `apps/bff/src/server.ts`
- `apps/bff/src/summary.ts`
- `apps/bff/src/agent/llm-gateway.ts`
- `apps/webui/src/contexts/MailContext.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/ArtifactsLibraryPanel.tsx`
- `apps/webui/src/components/dashboard/knowledgebase/KnowledgeBaseView.tsx`
- `apps/webui/src/components/dashboard/TutorialView.tsx`
- `apps/webui/e2e/smoke.spec.ts`

## Sub-Agent Findings And Fixes

### Backend

- Initial backend audit found a High issue: historical KB summarization bypassed source-specific LLM routing by calling SiliconFlow directly.
  - Fixed by routing historical and single-mail summarization through `LlmGatewayService.generateText()`, preserving tenant/source route resolution and LLM usage accounting.
- Initial backend audit found a Medium issue: artifact export failures after `/api/mail/processing/run` were hidden behind a completed status.
  - Fixed by marking the knowledge-base stage failed when artifact export fails, which makes the overall processing result partial and exposes the error in warnings.
- Initial backend audit found a Medium issue: file-backed KB read endpoints required live mailbox routing readiness.
  - Fixed by making `resolveKbTenant()` routing checks optional and requiring routing only for the backfill trigger route.
- A later backend audit found a Medium issue: malformed DB LLM route ciphertext could throw before default route fallback.
  - Fixed by catching `decryptSecret()` failures, logging, and continuing to the next route/default fallback.
- Final backend re-audit:
  - Agent: `019d9fc7-ef5d-7743-a54a-e16aeeaf5412` (`Ampere`)
  - Result: `No findings`

### Frontend

- Initial frontend audits found stale artifact/content/list races in the documents tab and missing source pinning.
  - Fixed with `sourceId` query pinning, list/content request ids, source reset, and smoke coverage for overlapping document refreshes.
- Frontend audit found KB slices were not cleared on active mailbox switch.
  - Fixed by clearing `kbStats`, `kbMails`, `kbEvents`, and `kbPersons` on source changes.
- Frontend audit found `TutorialView` could accept stale artifact responses.
  - Fixed with a tutorial artifact request id and source reset path.
- Frontend audit found `ArtifactsLibraryPanel` kept a stale success baseline badge after artifact-list failure.
  - Fixed by resetting `baselineReady` on artifact-list failure.
- Frontend audit found `KnowledgeBaseView.loadAll()` could leave `loading` true if future fetchers throw.
  - Fixed with `try/finally` and explicit `void loadAll()` in the mount effect.
- Frontend final re-audit after these fixes found a Medium issue: `fetchSources()` could accept a stale source-list response.
  - Fixed with `sourcesRequestIdRef` in `MailContext`.
- Final frontend clean re-audit:
  - Agent: `019d9fcc-59ff-7402-88cd-4650551d0f9b` (`Dirac`)
  - Result: blocked by Codex usage limit after the final `fetchSources()` fix.
  - Blocker: sub-agent quota exhausted until 21:01 local time.
  - Current status: all returned Critical/High findings fixed, the last returned Medium finding fixed, and targeted local validation passes.

## Validation

- `npm run check` in `apps/bff`: passed
- `npm run check` in `apps/webui`: passed
- `npm run test:e2e -- e2e/smoke.spec.ts` in `apps/webui`: `14 passed`
- `git diff --check`: passed
- Earlier full `npm run check:standard` before the final `fetchSources()` fix reached smoke successfully once in this task; a later full rerun was interrupted by the user for length. Targeted validation above was rerun after the final fix.

