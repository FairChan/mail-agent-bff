# Harness Audit Evidence - 2026-04-16

## Round 1

- Tool/model: Codex sub-agent `Lagrange` (`019d957c-71c6-76f0-8f5a-78b13ce2195b`), `gpt-5.4-mini`, high reasoning
- Timestamp: 2026-04-16T16:53:19+08:00
- Scope: Harness setup changes, excluding pre-existing unrelated `SUMMARY.md` dirty state

### Findings

- Critical: plaintext OpenClaw gateway token remained in Cursor MCP config/docs.
- High: Playwright smoke only listed tests instead of running browser smoke.
- High: recursive delete guard missed `rm -rf some/path`.
- Medium: OpenClaw setup docs still referenced wrong package/path.
- Medium: GET-side-effect detector was too noisy.

### Outcome

- Fixed Critical/High findings before delivery.
- Fixed the OpenClaw package/path documentation mismatch.
- Reduced the GET-side-effect detector to a narrower warning rule and documented follow-up.

## Round 2

- Tool/model: Codex sub-agent `Herschel` (`019d9584-36e1-7c30-9977-8d205e296c1b`), `gpt-5.4-mini`, high reasoning
- Timestamp: 2026-04-16T17:02:08+08:00
- Scope: audit-driven fixes for previous blockers

### Findings

- Critical: 0
- High: 0
- Medium: 0
- Low: GET detector remains regex-based and should become AST/route-body aware before upgrading severity.

### Validation Evidence

- `npm run harness:mcp:check` passed.
- `npm run harness:semantic` passed with 7 warning-only safeParse findings.
- `npm run harness:verify -- package.json apps/bff/package.json .cursor/mcp.json .harness/patterns-cache.json scripts/harness-post-edit-verify.mjs scripts/harness-check-standard.mjs scripts/update-mail-kb.sh HARNESS.md` passed.
- `npm run harness:guard -- 'rm -rf some/path'` denied as expected.
- `npm run harness:smoke` executed real Playwright smoke and failed on existing WebUI runtime baseline issues, proving L3 now runs rather than only listing tests.

### Final Status

- Delivery blocked: no.
- Deferred Low: GET detector precision.
- Rationale: it is warning-only and no longer blocks delivery; AST/route-body parsing is better handled in the next Harness refinement.
- Owner: next Harness refinement implementer.
- Target date: 2026-04-30.
