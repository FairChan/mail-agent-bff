# Multi Mail Provider Architecture

This project now separates mail account onboarding into provider descriptors plus connection adapters.

## Provider tracks

- Microsoft Outlook: existing Microsoft Graph OAuth path. Supports mail read, calendar write, and webhook/poll processing.
- Gmail: supports a direct Google OAuth path for Gmail API mailbox reads, plus IMAP fallback with an app password.
- Apple iCloud Mail: IMAP with an Apple app-specific password.
- NetEase 163 Mail: IMAP with a client authorization code after IMAP/SMTP is enabled in mailbox settings.
- QQ Mail: IMAP with an authorization code after IMAP/SMTP is enabled in mailbox settings.
- Aliyun Mail: IMAP with password or authorization code depending on account policy. Personal mail defaults to `imap.aliyun.com`; enterprise mail can override to `imap.qiye.aliyun.com` or `imap.mxhichina.com`.
- Custom IMAP: school or enterprise mailboxes that expose standard IMAP.

## Runtime flow

1. `GET /api/mail/providers` returns the provider catalog and default IMAP settings.
2. `GET /api/mail/connections/gmail/direct/start` and `/callback` run the Google OAuth popup flow, persist encrypted Gmail OAuth tokens in `GoogleAccount`, and create a tenant-owned `MailSource` with `connectionType=gmail_oauth`.
3. `POST /api/mail/connections/imap` verifies IMAP login by opening `INBOX`.
4. IMAP onboarding creates a tenant-owned `MailSource` with `connectionType=imap_password`.
5. IMAP passwords and Gmail OAuth tokens are encrypted at rest with `APP_ENCRYPTION_KEY`.
6. Inbox list, detail view, triage, knowledge-base summarization, notification polling, and agent retrieval use the same `MailSourceContext` as Outlook.
7. Calendar write remains enabled only for providers with a calendar API adapter. Gmail direct and IMAP sources currently return `MAIL_PROVIDER_CALENDAR_UNSUPPORTED`.

## Security notes

- IMAP credentials are never returned to the WebUI.
- Gmail OAuth tokens are never returned to the WebUI after callback completion.
- Credentials are encrypted at rest with `APP_ENCRYPTION_KEY`.
- The credential table is keyed by `userId` and unique `sourceId`, and the DB relation also binds `(sourceId, userId)` back to `MailSource`, so source access stays tenant-scoped.
- The Gmail OAuth store is keyed by `(userId, email)` and only rehydrates tokens inside tenant-scoped BFF requests.
- IMAP onboarding is TLS-only in this rollout. Plaintext IMAP is rejected even for custom hosts.
- The existing API mail privacy layer still masks mail content before LLM calls.

## Source references

- Google OAuth web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Gmail API scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail IMAP/OAuth2: https://developers.google.com/workspace/gmail/imap/imap-smtp
- iCloud Mail server settings: https://support.apple.com/102525
- Aliyun Mail IMAP/POP/SMTP settings: https://help.aliyun.com/document_detail/465307.html
- Aliyun third-party client policy for enterprise mail: https://help.aliyun.com/document_detail/606337.html
