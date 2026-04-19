# Remote WebUI Sync (2026-04-19)

This directory is a direct reference sync of the frontend imported from the user-provided remote server on `2026-04-19`.

## What is included

- `src/`
- `public/`
- `scripts/postbuild.mjs`
- `index.html`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `workspace.package.json` from the remote workspace root

## What is intentionally excluded

- `.env`
- `.env.production`
- `dist/`
- `node_modules/`

## Important runtime note

- This reference is not standalone.
- `vite.config.ts` proxies `/api`, `/live`, `/ready`, and `/health` to `http://127.0.0.1:8787`.
- `src/App.tsx` also supports `VITE_BFF_BASE_URL`; without it, production requests fall back to same-origin.
- The imported UI expects a matching BFF surface behind those routes.
- `snapshot_default_outlook` in the imported files is only a preserved snapshot placeholder, not a required canonical source ID.

## Why this is a reference copy, not a hard overwrite

The remote frontend is a lighter UI shell built around a single large `App.tsx` plus presentational page components such as:

- `src/components/pages/StatsPage.tsx`
- `src/components/pages/CalendarPage.tsx`
- `src/components/pages/SettingsPage.tsx`
- `src/components/sidebar/ResizableSidebar.tsx`
- `src/components/omnisearch/*`

The active local app in [`apps/webui`](/Users/fairchan/Desktop/mail-agent-bff/apps/webui) now owns richer product flows that are already wired to the current BFF:

- Outlook direct auth bridge
- notification center and urgent toast
- knowledge-base pages and artifacts
- tutorial flow
- agent window
- new-mail processing workbench

Blindly replacing the active app with the remote copy would regress those working flows. This sync preserves the remote implementation for safe reuse while keeping the current running app intact.

## Practical next step

Use this folder as a source for selective UI migration:

- visual shell and layout ideas from `src/App.tsx`
- sidebar/account UX from `src/components/sidebar/*`
- stats/calendar/settings presentation from `src/components/pages/*`
- search interaction from `src/components/omnisearch/*`
