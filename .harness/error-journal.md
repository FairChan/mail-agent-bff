# Harness Error Journal

Record failures that should become future automatic prevention.

## Entry Template

- Timestamp:
- Trigger:
- ROOT CAUSE:
- COSMETIC FIX REJECTION:
- REAL FIX:
- Candidate pattern:


## 2026-04-16T16:42:07+08:00

- Trigger: dangerous-cmd-guard: rm -rf /tmp/example
- ROOT CAUSE: A command matched a Harness deny rule for destructive local or external side effects.
- COSMETIC FIX REJECTION: Do not bypass the guard by changing syntax while keeping the same destructive action.
- REAL FIX: Use a recoverable, scoped, or explicitly approved operation.
- Candidate pattern: danger-rm-rf

## 2026-04-16T16:42:35+08:00

- Trigger: harness-semantic-check false-positive tuning
- ROOT CAUSE: The initial GET side-effect detector matched route names containing update/delete rather than verified handler side effects.
- COSMETIC FIX REJECTION: Do not silence all GET side-effect checks or add broad allow comments across the codebase.
- REAL FIX: Downgrade the noisy regex to warn until a route-body or AST-aware detector exists.
- Candidate pattern: refine no-get-side-effect before upgrading back to error.

## 2026-04-16T16:44:38+08:00

- Trigger: npm install failed with mirror tarball ENOTFOUND and npm "Exit handler never called"
- ROOT CAUSE: `package-lock.json` contained tarball URLs under `http://mirrors.tencentyun.com/npm/`, which were not resolvable in this environment.
- COSMETIC FIX REJECTION: Do not keep retrying npm or force-install around a broken lockfile host.
- REAL FIX: Normalize lockfile tarball hosts to `https://registry.npmjs.org/` and rerun install.
- Candidate pattern: detect non-portable lockfile registry hosts during `check:standard`.

## 2026-04-16T16:47:00+08:00

- Trigger: `npm run check:standard` after dependency restore
- ROOT CAUSE: The Harness gate is now wired correctly, but the existing BFF/WebUI TypeScript baseline is red.
- COSMETIC FIX REJECTION: Do not remove typecheck from `check:standard` just to make Harness appear green.
- REAL FIX: Keep Harness checks passing, document the product baseline blocker, and fix product TypeScript drift in a dedicated refactor.
- Candidate pattern: add a baseline debt report before upgrading standard gate to blocking in CI.

## 2026-04-16T16:50:00+08:00

- Trigger: `npm audit --audit-level=high`
- ROOT CAUSE: Current dependency graph contains high-severity advisories in `argon2`/`tar`, `fastify`, `nodemailer`, and `prisma`/`effect`.
- COSMETIC FIX REJECTION: Do not run `npm audit fix --force` inside Harness setup; it can apply semver-major upgrades and change runtime behavior.
- REAL FIX: Track as product dependency hardening and upgrade packages deliberately with targeted tests.
- Candidate pattern: standard gate should summarize high audit findings without force-upgrading automatically.

## 2026-04-16T16:58:10+08:00

- Trigger: `npm run harness:smoke`
- ROOT CAUSE: Real Playwright smoke is wired and now exposes existing WebUI runtime failures rather than merely listing tests.
- COSMETIC FIX REJECTION: Do not return to `playwright test --list`; that hides browser regressions.
- REAL FIX: Keep smoke active and fix the product baseline separately: title expectation/runtime copy, `AuthScreen` props/defaults, and local BFF availability or mock.
- Candidate pattern: smoke tests should require either a running BFF or an explicit mock mode.

## 2026-04-16T16:52:28+08:00

- Trigger: dangerous-cmd-guard: git push --force origin main
- ROOT CAUSE: A command matched a Harness deny rule for destructive local or external side effects.
- COSMETIC FIX REJECTION: Do not bypass the guard by changing syntax while keeping the same destructive action.
- REAL FIX: Use a recoverable, scoped, or explicitly approved operation.
- Candidate pattern: danger-force-push

## 2026-04-16T16:52:28+08:00

- Trigger: dangerous-cmd-guard: rm -rf /tmp/example
- ROOT CAUSE: A command matched a Harness deny rule for destructive local or external side effects.
- COSMETIC FIX REJECTION: Do not bypass the guard by changing syntax while keeping the same destructive action.
- REAL FIX: Use a recoverable, scoped, or explicitly approved operation.
- Candidate pattern: danger-rm-rf

## 2026-04-16T16:57:14+08:00

- Trigger: dangerous-cmd-guard: rm -rf some/path
- ROOT CAUSE: A command matched a Harness deny rule for destructive local or external side effects.
- COSMETIC FIX REJECTION: Do not bypass the guard by changing syntax while keeping the same destructive action.
- REAL FIX: Use a recoverable, scoped, or explicitly approved operation.
- Candidate pattern: danger-rm-rf

## 2026-04-16T16:59:55+08:00

- Trigger: dangerous-cmd-guard: rm -rf some/path
- ROOT CAUSE: A command matched a Harness deny rule for destructive local or external side effects.
- COSMETIC FIX REJECTION: Do not bypass the guard by changing syntax while keeping the same destructive action.
- REAL FIX: Use a recoverable, scoped, or explicitly approved operation.
- Candidate pattern: danger-rm-rf

## 2026-04-16T17:07:36+08:00

- Trigger: dangerous-cmd-guard: rm -rf some/path
- ROOT CAUSE: A command matched a Harness deny rule for destructive local or external side effects.
- COSMETIC FIX REJECTION: Do not bypass the guard by changing syntax while keeping the same destructive action.
- REAL FIX: Use a recoverable, scoped, or explicitly approved operation.
- Candidate pattern: danger-rm-rf
