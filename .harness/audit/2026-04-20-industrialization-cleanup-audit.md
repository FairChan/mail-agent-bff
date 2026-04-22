# 2026-04-20 Industrialization Cleanup Audit

- Task type: Code
- Implementer: Codex main session
- Audit cap: 3 rounds
- Timestamp: 2026-04-20T17:55:40+08:00

## Scope

- Repository boundary cleanup and guardrails for generated/runtime/legacy files.
- Production fail-closed configuration checks for BFF persistence, auth sessions, Microsoft OAuth, encryption, and mail source behavior.
- Kubernetes deployment manifests for BFF/WebUI production shape.
- WebUI mail-body HTML sanitization consolidation.
- Removal from version control of tracked runtime mailbox data, local generated artifacts, imported reference WebUI snapshot, and retired login prototype.

No mailbox contents, runtime data payloads, or secrets were sent to external audit. Only code/config diffs plus path-category deletion counts were provided.

## Audit Round 1

Primary sub-agent attempt:

- Tool/process: Codex `spawn_agent`
- Agent id: `019daa00-d061-7651-b158-d55183f09db9`
- Result: failed before review due platform usage limit.
- Error class: quota/usage limit.

Fallback independent audit:

- Tool/process: SiliconFlow Chat Completions
- Model: `Pro/zai-org/GLM-5.1`
- Timestamp from provider response: 2026-04-20T09:54:10.508Z
- Result: PASS

External audit output:

```text
1. Verdict: PASS

2. Critical/High findings: None

3. Medium/Low findings:
- K8s probe paths unverified in diff: Liveness changed to /live, readiness to /api/ready. If the BFF doesn't serve these exact routes, the pod will fail probes and crash-loop. The port fix is correct; the path change is plausible but cannot be confirmed from the diff alone.
- <b> tag dropped from ALLOWED_TAGS: the old MailDetailModal allowlist included b; the new centralized sanitizer includes i, em, strong but omits b. Minor rendering regression for emails using <b>.
- hardenSanitizedLinks no-ops in SSR: acceptable for client-only WebUI, but future SSR would skip link hardening.
- ALLOWED_ATTR ["href","target","rel","title"] applies to all tags: not exploitable, but can preserve invalid href attributes on non-anchor elements.
- decodeCommonEntities is partial: safe, but can route some escaped non-tag content through the HTML branch.

4. Suggested follow-ups:
- Verify BFF actually registers /live and /api/ready routes before merging the K8s manifest.
- Add b to ALLOWED_TAGS for parity with old allowlist and common email HTML.
- Consider adding a repo-boundary rule for coverage/ and apps/*/coverage/.
- Wire check:repo-boundary into pre-commit or CI.
- Confirm parseBooleanFlag returns false for undefined/empty/"0"/"false".
```

## Audit-Driven Fixes

- Verified BFF routes: `apps/bff/src/server.ts` registers `/live`, `/api/live`, `/ready`, and `/api/ready`, so the K8s probe paths are supported.
- Added `b` to `sanitizeMailBodyHtml` allowed tags for common email formatting parity.
- Added `coverage-output` to `scripts/check-repo-boundary.mjs`, covering root `coverage/` and `apps/*/coverage/`.
- Existing `check:repo-boundary` is now part of `npm run check:standard` via `scripts/harness-check-standard.mjs`.
- `parseBooleanFlag` is shared by config parsing and treats missing/empty/`false`/`0` as false; production checks fail closed when required flags are absent.

## Deferred Medium/Low Rationale

- SSR link-hardening note: current app is Vite client-rendered; `sanitizeMailBodyHtml` is only used by browser mail detail views. Owner: WebUI. Target: revisit if SSR is introduced.
- DOMPurify tag-specific attribute cleanliness: invalid non-anchor `href` preservation is non-clickable and non-security-impacting after link hardening. Owner: WebUI. Target: cleanup during sanitizer unit-test pass.
- Partial entity decode false-positive: DOMPurify remains the sanitizer for the HTML branch; this is not a safety issue. Owner: WebUI. Target: cleanup during sanitizer unit-test pass.

## Validation

- `npm --workspace apps/bff run check`: PASS
- `npm --workspace apps/webui run check`: PASS
- `npm run check:repo-boundary`: PASS (`REPO_BOUNDARY_OK`)
- `npm run harness:semantic`: PASS before final small sanitizer/boundary refinements (`HARNESS_SEMANTIC_OK checked=147 warnings=11`, existing safeParse warnings)
- `npm run build`: PASS after audit-driven fixes
- `git diff --check`: PASS after documentation/audit note writes
- `git diff --cached --check`: PASS after staged cleanup deletions

## Final Status

No unresolved Critical or High findings remain. All actionable audit findings with meaningful delivery impact were fixed and revalidated; remaining Medium/Low notes are documented with rationale and owners.
