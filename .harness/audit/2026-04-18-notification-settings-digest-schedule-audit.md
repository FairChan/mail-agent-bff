# Notification Settings And Digest Schedule Audit

- Scope: WebUI notification-settings configurability and daily-digest scheduling flow.
- Changed files:
  - `apps/webui/src/components/dashboard/SettingsView.tsx`
  - `apps/webui/src/contexts/MailContext.tsx`
  - `apps/webui/e2e/smoke.spec.ts`
- Audit log compiled: `2026-04-18T01:17:12+08:00`

## Audit Timeline

1. Initial independent audit
   - Auditor: `Huygens` (`019d9c67-8f70-7861-b981-8be58afc0218`)
   - Model/tool: `explorer`, `gpt-5.4-mini`, reasoning `low`
   - Findings:
     - stale notification preferences could repaint after active-source clear/switch
     - smoke coverage did not prove source-bound notification preference persistence

2. Follow-up independent audit after first fixes
   - Auditor: `Einstein` (`019d9c6e-3eb4-7860-bf4a-f0542845c087`)
   - Model/tool: `explorer`, `gpt-5.4-mini`, reasoning `low`
   - Findings:
     - settings form could save stale local values into a newly selected source before fresh prefs loaded
     - smoke mock still allowed GET preference fetches without a hard `sourceId` assertion

3. Final independent audit after remediation
   - Auditor: `Arendt` (`019d9c71-c05d-75a1-b980-3f869b766eee`)
   - Model/tool: `explorer`, `gpt-5.4-mini`, reasoning `low`
   - Result: `No findings`

## Remediation Summary

- Tightened `MailContext.fetchNotificationPrefs()` so late responses are ignored whenever the active source no longer matches the request source.
- Reset the settings form on source change, gated notification controls behind `notificationPrefsReady`, and prevented saves until the current source's preferences finish loading.
- Expanded smoke mocks to keep per-source notification preference state, assert `sourceId` on POST, assert `sourceId` query params on GET, and verify that two sources preserve distinct notification settings.

## Validation After Fixes

- `npm --workspace packages/shared-types run typecheck`
- `npm --workspace apps/webui run check`
- `npm --workspace apps/bff run check`
- `npm --workspace apps/webui run build`
- `npm --workspace apps/bff run build`
- `npm run harness:smoke` -> `10/10` passed
- `git diff --check`
- `npm run check:standard` -> `HARNESS_STANDARD_OK`

## Final Status

- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`
- Deliverable: `yes`
