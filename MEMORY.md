# MEMORY.md - Long-Term Memory

## Harness Direction

- The user wants this workspace to evolve toward a Harness architecture: Hook layer, Agent layer, Skill workflows, verification pyramid, and a knowledge loop fed by real failures.
- The guiding principle is "prove it, don't just say it": code work should be followed by automated checks and independent audit.
- Development and tests should avoid high-frequency access to real mail/calendar accounts. Prefer local fixtures, Inspectr/OpenAPI mocks, Playwright smoke tests, and isolated IMAP sandboxes.

## Workspace Notes

- `summary.md` is the project change log and must receive one ISO-8601 entry per task.
- Code tasks require independent sub-agent audit before final delivery, with Critical/High findings fixed.
- `BOOTSTRAP.md` was present on 2026-04-16; minimal identity/user/memory initialization was completed so future sessions can start directly from the normal memory files.

