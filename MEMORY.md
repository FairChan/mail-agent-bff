# MEMORY.md - Long-Term Memory

## Harness Direction

- The user wants this workspace to evolve toward a Harness architecture: Hook layer, Agent layer, Skill workflows, verification pyramid, and a knowledge loop fed by real failures.
- The guiding principle is "prove it, don't just say it": code work should be followed by automated checks and independent audit.
- Development and tests should avoid high-frequency access to real mail/calendar accounts. Prefer local fixtures, Inspectr/OpenAPI mocks, Playwright smoke tests, and isolated IMAP sandboxes.

## Workspace Notes

- `summary.md` is the project change log and must receive one ISO-8601 entry per task.
- Code tasks require independent sub-agent audit before final delivery, with Critical/High findings fixed.
- Sub-agent audit should run at most 3 rounds per task. Each round should be comprehensive and truthful, but reports should stay concise and token-efficient.
- RTK is installed at `~/.local/bin/rtk` and enabled for Codex via `~/.codex/AGENTS.md` referencing `~/.codex/RTK.md`; prefer RTK for noisy shell commands in future conversations.
- `BOOTSTRAP.md` was present on 2026-04-16; minimal identity/user/memory initialization was completed so future sessions can start directly from the normal memory files.
