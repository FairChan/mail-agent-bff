---
name: suggesting-cursor-hooks
description: Suggest and draft Cursor hook automation when repeated manual checks or guard commands appear during development.
---

# suggesting-cursor-hooks

Use this skill when the same local check, guard, or verification command is being repeated often enough that it should become a Cursor hook.

## Workflow

1. Identify the repeated action and the trigger that should own it.
2. Prefer local-only commands that do not need production credentials.
3. Draft the hook in `.cursor/hooks.harness.template.json` first unless the active Cursor hook schema is confirmed.
4. Keep hooks short and composable:
   - before command: `npm run harness:guard -- {{command}}`
   - after edit: `npm run harness:verify -- {{files}}`
   - before stop: `npm run check:standard`
5. If a hook creates too much noise, tune cooldown or scope before making it stricter.

## Safety

- Never add hooks that send email, push code, post comments, or mutate external services.
- Deny safety violations; warn on style or DX issues.
- Add an explicit allow tag for any rule that can have legitimate exceptions.

