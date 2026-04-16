---
name: suggesting-cursor-rules
description: Convert repeated corrections and incident lessons into Cursor rules and Harness patterns.
---

# suggesting-cursor-rules

Use this skill when a user correction, failed check, or repeated review comment should become durable guidance.

## Workflow

1. Confirm the lesson is tied to a real failure or repeated correction.
2. Classify it:
   - behavior rule: `.cursor/rules/*.mdc`
   - automatic detector: `.harness/patterns-cache.json`
   - long-term memory: `MEMORY.md`
   - raw incident: `.harness/error-journal.md`
3. Prefer a detector when the issue can be found mechanically.
4. Add `allowTag` to detector rules when exceptions are legitimate.
5. Keep rule wording short, testable, and tied to the risk it prevents.

## Safety

- Do not add broad rules that would block normal development without a real incident.
- Do not store credentials or private mailbox content in rules.
- Upgrade warn to error only after repeated violations or explicit user approval.

