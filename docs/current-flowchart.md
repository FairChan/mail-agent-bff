# Current Flowchart And Smoothness Check

Generated at: `2026-04-16T23:06:00+08:00`

Scope:

- Covers the current local code and the recent local-admin seed changes in `apps/bff/src/config.ts` and `apps/bff/src/server.ts`.
- Treats Azure/Microsoft Entra app-registration setup as intentionally out of scope for this pass.
- Evaluates the rest of the runtime flow: WebUI, BFF auth/session, mail-source routing, mail triage/insights/detail, calendar sync, agent runtime, knowledge base surface, and Harness checks.

## 1. Overall Runtime Flow

```mermaid
flowchart TD
  User["User in browser"] --> WebUI["WebUI React Vite app"]
  WebUI --> Providers["Context providers: Auth, Mail, App, Theme"]
  Providers --> AuthUI{"Authenticated"}
  AuthUI -- "No" --> Login["Login or register screen"]
  Login --> AuthApi["BFF auth APIs"]
  AuthUI -- "Yes" --> Main["Dashboard shell"]

  Main --> Settings["Settings: account, Outlook source, locale"]
  Main --> Inbox["Inbox: triage and upcoming items"]
  Main --> AllMail["All mail list and detail"]
  Main --> Calendar["Calendar sync view"]
  Main --> Stats["Stats view"]
  Main --> KB["Knowledge base view"]

  WebUI --> BFF["Fastify BFF"]
  AuthApi --> BFF
  BFF --> Guard["API session guard for /api/*"]
  Guard --> Session["HttpOnly bff_session cookie and user/session maps"]
  Session --> AuthStore{"Auth store"}
  AuthStore -- "Prisma enabled" --> Prisma["Prisma user table"]
  AuthStore -- "Prisma disabled" --> MemoryAuth["In-memory users and sessions"]
  Session --> Redis{"Redis sessions optional"}
  Redis -- "enabled" --> RedisStore["Redis session store"]
  Redis -- "disabled" --> MemorySession["In-memory session state"]

  BFF --> Readiness["/live and /ready health probes"]
  Readiness --> DirectMode{"Gateway bearer configured"}
  DirectMode -- "No" --> DirectDeps["Direct mode dependencies: SiliconFlow plus Composio or Microsoft"]
  DirectMode -- "Yes" --> OpenClaw["OpenClaw Gateway session_status"]

  BFF --> MailRoutes["Mail APIs"]
  MailRoutes --> SourceGuard["Resolve source and require ready routing"]
  SourceGuard --> Provider{"Source connection type"}
  Provider -- "microsoft" --> Graph["Microsoft Graph direct client"]
  Provider -- "composio" --> Composio["Composio MCP or OpenClaw tool bridge"]
  Provider -- "legacy gateway" --> OpenClaw

  MailRoutes --> MailLogic["mail.ts triage, insights, inbox, detail, calendar"]
  MailLogic --> AISummary["AI summary cache and batch summarization"]
  AISummary --> AgentModel{"Model path"}
  AgentModel -- "Gateway configured" --> OpenClawResponses["OpenClaw /v1/responses"]
  AgentModel -- "Gateway missing" --> SiliconFlow["SiliconFlow chat completion"]

  MailRoutes --> AgentRuntime["Agent runtime for mail QA"]
  AgentRuntime --> Skills["Local skill registry"]
  AgentRuntime --> Memory["File memory store"]
  AgentRuntime --> Hooks["Hook engine: after_response and on_error"]
  AgentRuntime --> SiliconFlow

  KB --> KBApi["/api/mail-kb/* and /api/mail/knowledge-base/*"]
  KBApi -.-> MissingKB["Current gap: routes exist in module but are not registered in server.ts"]

  MailLogic --> Response["JSON result envelope"]
  Response --> Providers
  Providers --> UIState["React state and rendered views"]
```

## 2. Startup And Local Admin Seed Flow

```mermaid
flowchart TD
  Start["Start BFF: tsx watch src/server.ts or node dist/server.js"] --> LoadEnv["Load dotenv and validate env schema"]
  LoadEnv --> Config["Build env object: trustProxy, allowedTools, redis flags, local admin fields"]
  Config --> Fastify["Create Fastify with logger and trustProxy"]
  Fastify --> CORS["Register CORS with configured origins"]
  CORS --> Stores["Initialize Prisma auth store and Redis session store"]
  Stores --> SeedCheck{"LOCAL_ADMIN_ENABLED"}
  SeedCheck -- "false" --> Listen["Listen on HOST and PORT"]
  SeedCheck -- "true" --> ValidateAdmin["Validate LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD"]
  ValidateAdmin --> Existing{"User already exists"}
  Existing -- "Yes" --> LogExists["Log email only, skip creation"]
  Existing -- "No" --> Hash["Create Argon2 password hash"]
  Hash --> CreateUser["Create auth user record with display name and locale"]
  CreateUser --> LogSeeded["Log seeded email only"]
  LogExists --> Listen
  LogSeeded --> Listen
```

Smoothness notes:

- The new local admin seed path is straightforward and runs before `server.listen`.
- It validates email and password length before writing.
- It does not create a real RBAC admin role. The account is currently an ordinary user with an admin-looking name.
- Do not commit or share audit/log files that contain plaintext local credentials.

## 3. Auth And Session Flow

```mermaid
flowchart TD
  Browser["Browser opens app"] --> SessionCheck["GET /api/auth/session"]
  SessionCheck --> HasCookie{"Valid bff_session cookie"}
  HasCookie -- "No" --> LoginScreen["Show login/register"]
  HasCookie -- "Yes" --> UserView["Return authenticated user snapshot"]
  LoginScreen --> LoginPost["POST /api/auth/login"]
  LoginPost --> RateLimit["Per-IP login rate limit"]
  RateLimit --> Legacy{"Legacy apiKey payload"}
  Legacy -- "Yes" --> KeyCompare["Constant-time BFF_API_KEY compare"]
  Legacy -- "No" --> PasswordAuth["Normalize email and verify Argon2 password"]
  PasswordAuth --> AuthOk{"Valid credentials"}
  KeyCompare --> AuthOk
  AuthOk -- "No" --> AuthError["401 invalid credentials"]
  AuthOk -- "Yes" --> CreateSession["Create session token and TTL"]
  CreateSession --> Cookie["Set HttpOnly bff_session cookie"]
  Cookie --> AuthenticatedUI["Render authenticated dashboard"]
  AuthenticatedUI --> Logout["POST /api/auth/logout"]
  Logout --> Clear["Clear memory and Redis session state, clear cookie"]
```

Smoothness notes:

- The BFF protects all `/api/*` routes except the public auth endpoints through `onRequest`.
- Session status intentionally uses no-store headers.
- Login and register have rate limiting.
- Logout is allowed without an existing valid session so the browser can clean itself up.

## 4. Mail Source Connection Flow

```mermaid
flowchart TD
  Settings["Settings page"] --> FetchSources["GET /api/mail/sources"]
  FetchSources --> SourceList["Show default and custom sources"]
  Settings --> DirectStart["Click Microsoft Outlook direct login"]
  DirectStart --> StartRoute["GET /api/mail/connections/outlook/direct/start"]
  StartRoute --> MicrosoftConfigured{"Microsoft direct auth configured"}
  MicrosoftConfigured -- "No, current out-of-scope state" --> ConfigNeeded["Return popup page explaining missing Microsoft OAuth config"]
  MicrosoftConfigured -- "Yes, after Azure config" --> Redirect["Redirect popup to Microsoft authorize URL"]
  Redirect --> Callback["GET /api/mail/connections/outlook/direct/callback"]
  Callback --> CompleteAuth["Exchange code, store Microsoft account in current session"]
  CompleteAuth --> UpsertSource["Create or reuse Microsoft source"]
  UpsertSource --> VerifySource["Verify mailbox access"]
  VerifySource --> Ready{"Verified and no fail-fast"}
  Ready -- "Yes" --> Activate["Set active source id"]
  Ready -- "No" --> Pending["Show source as pending verification"]

  Settings --> ManualSource["Manual Composio source entry"]
  ManualSource --> CreateSource["POST /api/mail/sources with label, mailboxUserId, connectedAccountId"]
  CreateSource --> ManualVerify["POST /api/mail/sources/verify"]
  ManualVerify --> Ready
```

Smoothness notes:

- The Microsoft direct login route is intentionally blocked until Azure/Microsoft Entra values exist.
- Manual Composio source creation requires both `mailboxUserId` and `connectedAccountId`.
- Source selection is guarded: non-ready sources return `412 MAIL_SOURCE_NOT_READY`.

## 5. Main Mail Experience Flow

```mermaid
flowchart TD
  ActiveSource["activeSourceId exists"] --> LoadInbox["InboxView useEffect"]
  LoadInbox --> TriageReq["GET /api/mail/triage"]
  LoadInbox --> InsightsReq["GET /api/mail/insights"]
  TriageReq --> SourceReady1["Resolve source and require routing ready"]
  InsightsReq --> SourceReady2["Resolve source and require routing ready"]

  SourceReady1 --> Triage["triageInbox"]
  SourceReady2 --> Insights["buildMailInsights"]
  Triage --> ProviderFetch["Fetch Outlook inbox messages"]
  Insights --> ProviderFetch
  ProviderFetch --> Rules["Apply custom priority rules"]
  Rules --> Classification["Four-quadrant classification"]
  Classification --> SummaryBatch["AI summary enrichment with cache"]
  SummaryBatch --> TriageResponse["Return triage result"]
  SummaryBatch --> InsightsResponse["Return insight timeline and digest"]

  TriageResponse --> InboxUI["Priority queue and quadrant cards"]
  InsightsResponse --> UpcomingUI["Upcoming schedule and DDL list"]
  InboxUI --> Prefetch["Prefetch top mail bodies"]
  Prefetch --> DetailReq["GET /api/mail/message"]
  DetailReq --> DetailUI["Mail detail page or modal"]

  UpcomingUI --> CalendarSync["POST /api/mail/calendar/sync"]
  CalendarSync --> Dedupe["Dedupe by messageId, type, dueAt"]
  Dedupe --> CalendarProvider{"Provider"}
  CalendarProvider -- "microsoft" --> GraphCalendar["Create Microsoft Graph event"]
  CalendarProvider -- "composio" --> ComposioCalendar["Create Outlook event through Composio"]
  GraphCalendar --> SyncResult["Synced status"]
  ComposioCalendar --> SyncResult
```

Smoothness notes:

- The normal mail UI flow is coherent once a ready source exists.
- BFF has timeout-degradation logic for triage and insights: if a large request times out, it retries with a smaller limit.
- Calendar sync has dedupe and stale-entry eviction before re-creating events.
- Current UI does not pass a timezone into `MailContext.fetchInsights`; BFF defaults still work, but user-selected timezone is not fully wired in this path.

## 6. Agent QA And Memory Flow

```mermaid
flowchart TD
  UserQuestion["User asks a mail question"] --> MailQuery["POST /api/mail/query or /api/agent/query"]
  MailQuery --> SourceResolve["Resolve optional sourceId and routing context"]
  SourceResolve --> Runtime["agentRuntime.query"]
  Runtime --> ContextLoad["Load relevant skills and memory"]
  ContextLoad --> ToolLoop["Model tool loop"]
  ToolLoop --> ToolList["list_recent_mail, search_mail, get_mail_detail, get_mail_insights, recall_memory, remember_note"]
  ToolList --> Grounding["Tool results ground answer"]
  Grounding --> FinalAnswer["Final answer with references"]
  FinalAnswer --> AfterResponse["Hook after_response writes redacted interaction memory"]
  Runtime --> OnError["Hook on_error writes redacted incident memory"]
```

Smoothness notes:

- The runtime is well separated from the older gateway proxy.
- Mail bodies, skills, and memory are treated as untrusted context in the system prompt.
- Memory writes redact emails, URLs, obvious secret prefixes, and long hex IDs.

## 7. Harness Development And Delivery Flow

```mermaid
flowchart TD
  Change["Edit code or docs"] --> Semantic["npm run harness:semantic"]
  Semantic --> Verify{"Changed source files"}
  Verify -- "Yes" --> Typecheck["npm run check --workspaces --if-present"]
  Verify -- "No" --> Summary["Append summary.md entry"]
  Typecheck --> Smoke{"Web e2e affected"}
  Smoke -- "Yes" --> Playwright["npm run harness:smoke"]
  Smoke -- "No" --> AuditGate["Code task audit gate"]
  Playwright --> AuditGate
  AuditGate --> CodeTask{"Task type Code"}
  CodeTask -- "Yes" --> SubAudit["Independent sub-agent audit"]
  SubAudit --> FixHigh["Fix Critical and High findings"]
  FixHigh --> Revalidate["Rerun relevant validation"]
  CodeTask -- "No" --> AuditNA["Audit N/A, no code changes"]
  Revalidate --> Summary
  AuditNA --> Summary
  Summary --> Final["Final delivery"]
```

Validation run for this pass:

- `npm run harness:semantic`: passed, with 8 existing zod-safe-parse warnings.
- `npm run check --workspaces --if-present`: passed.
- `curl http://127.0.0.1:8787/health`: reachable, returns `503` because direct mode has SiliconFlow configured but Composio and Microsoft direct auth are not configured.
- `curl http://127.0.0.1:5173/`: failed because the WebUI dev server is not currently running.

## 8. Smoothness Verdict

Overall:

- Core BFF startup, local auth, session guard, local admin seed, mail-source state machine, mail triage, mail insights, mail detail, calendar sync, agent QA, and Harness verification are structurally smooth.
- The Azure/Microsoft configuration gap is expected and intentionally excluded from this pass.
- The knowledge base UI path is currently not smooth.
- Local visual end-to-end verification cannot be completed until the WebUI dev server is started again.

Green areas:

- TypeScript check passes across workspaces.
- Harness semantic gate passes.
- BFF health endpoint is reachable and accurately reports missing external dependencies.
- Local admin seed path is clear and isolated behind `LOCAL_ADMIN_ENABLED`.
- `/api/*` session protection is centralized.
- Mail-source activation is guarded by routing verification.
- Mail processing has rate limits, timeout fallback, source isolation, summary cache, and calendar dedupe.

Issues to fix or track:

1. Knowledge base route registration gap.
   - Evidence: `apps/bff/src/routes/knowledge-base.ts` defines `/api/mail-kb/*`, but current `apps/bff/src/server.ts` does not appear to register it.
   - Impact: `KnowledgeBaseView` can call endpoints that the running monolithic server likely does not serve.
   - Suggested fix: wire `registerKnowledgeBaseRoutes(server, deps)` into `server.ts`, or move these handlers into the monolithic route section.

2. Knowledge base response-shape mismatch.
   - Evidence: `registerKnowledgeBaseRoutes` returns `{ ok: true, result: ... }`, while `MailContext.fetchKbStats`, `fetchKbMails`, `fetchKbEvents`, and `fetchKbPersons` read top-level `stats`, `mails`, `events`, and `persons`.
   - Impact: even if routes are registered, the UI may not populate KB data.
   - Suggested fix: normalize `MailContext` to read `data.result.stats`, `data.result.mails`, `data.result.events`, and `data.result.persons`, or change the BFF response contract.

3. Knowledge base trigger/job endpoints are referenced but not found in `server.ts`.
   - Evidence: WebUI calls `/api/mail/knowledge-base/trigger`, `/jobs/:jobId`, and `/jobs/:jobId/stream`.
   - Impact: the summarize modal flow is likely broken unless another server layer registers those routes.
   - Suggested fix: confirm intended module, then register or remove the UI entry until implemented.

4. Timezone parameter is inconsistent.
   - Evidence: BFF expects `tz`; `apps/webui/src/utils/api.ts` sends `timeZone`; `MailContext.fetchInsights` sends neither.
   - Impact: default timezone behavior works, but user-selected timezone is not reliably applied.
   - Suggested fix: use `tz` consistently from UI state through `fetchInsights`, `askMailQuestion`, notification poll, and calendar sync.

5. Provider API base is split.
   - Evidence: `App.tsx` defines `API_BASE` from `VITE_BFF_BASE_URL`, while `AuthProvider` and `MailProvider` default to `/api` and are not passed that value.
   - Impact: same-origin deployments are fine; separate dev/prod BFF origins may silently call the wrong URL.
   - Suggested fix: pass `apiBase={API_BASE}` into `AuthProvider` and `MailProvider`, or remove the unused local helper in `App.tsx`.

6. Local admin is not RBAC.
   - Evidence: auth user view contains id, email, displayName, and locale, but no role.
   - Impact: fine for local access, not a real admin authorization model.
   - Suggested fix: add role/permission only when there are actual admin-only surfaces.

7. Sensitive local credential exposure was found and redacted.
   - Evidence: previous local summary/audit text included the local admin password.
   - Current state: the password is now redacted in `summary.md`, `SUMMARY.md`, and `.harness/audit/2026-04-16-local-deploy-audit.md`.
   - Suggested fix: keep concrete local passwords out of future summaries, audits, screenshots, and PR text.

8. Current WebUI dev server is not running.
   - Evidence: `curl http://127.0.0.1:5173/` cannot connect.
   - Impact: type-level flow is green, but visual browser flow is not currently verifiable.
   - Suggested fix: start `npm run dev:web` when you want browser validation.
