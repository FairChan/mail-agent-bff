# Daily Digest Personalization Audit

- Task type: Code
- Timestamp: 2026-04-21T23:50:51+08:00
- Implementer: Codex main session
- Round 1 auditor: Codex sub-agent `Cicero`, `gpt-5.4-mini`, reasoning `high`
- Round 2 auditor: Codex sub-agent `Schrodinger`, `gpt-5.4-mini`, reasoning `high`
- Scope:
  - `apps/bff/src/server.ts`
  - `apps/bff/src/personalization-profile-store.ts`

## Round 1

Findings:

- Medium: a profile that only changed `deadlineAlertWindowHours` could still be treated as no runtime profile when `completed=false`.
- Low: hidden-topic matching in the digest summary ignored `signalsWithoutDate`.

Fixes applied:

- Included non-default `deadlineAlertWindowHours` in the runtime-profile activation gate.
- Extended hidden-topic digest matching to inspect `signalsWithoutDate`.

## Validation After Fixes

- `npm --workspace apps/bff run check` passed.
- `npm --workspace apps/bff run build` passed.
- Local authenticated smoke passed:
  - saved a temporary personalization profile with only `deadlineAlertWindowHours=72` and `completed=false`,
  - triggered `/api/mail/notifications/poll`,
  - confirmed the daily digest still contained the personal window summary line,
  - restored the original profile and original notification preferences.
- Earlier same-session authenticated smoke also confirmed personalized recommendations appeared in the digest output, including the draft-reply suggestion path.

## Round 2

Round 2 verified both fixes and reported no remaining findings.

Final status:

- No unresolved Critical findings.
- No unresolved High findings.
- No unresolved Medium findings.
- No unresolved Low findings.
