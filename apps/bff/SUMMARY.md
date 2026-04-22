# TrueSight BFF — 项目文档

> 本文档记录 TrueSight BFF 项目的架构和所有更新。

---

## 项目架构

### 技术栈


| 层级  | 技术                         |
| --- | -------------------------- |
| 运行时 | Node.js 22 + TypeScript    |
| 框架  | Fastify 5                  |
| 数据库 | PostgreSQL + Prisma ORM    |
| 缓存  | Redis                      |
| 邮件  | Nodemailer (OAuth2 / SMTP) |
| 认证  | JWT + Argon2               |
| 部署  | Docker / 直接运行              |


### 目录结构

```
apps/bff/
├── src/
│   ├── server.ts           # Fastify 入口，路由注册
│   ├── email.ts            # 邮件发送（验证码）
│   ├── email-persistence.ts # 邮件四象限持久化
│   ├── mail.ts             # Outlook 邮件 API 封装
│   ├── auth.ts             # 认证中间件 / JWT
│   ├── config.ts           # Zod 环境变量校验
│   └── *.ts                # 其他工具/路由
├── prisma/
│   └── schema.prisma       # 数据库 Schema
├── dist/                   # TypeScript 编译输出
├── scripts/
│   ├── get-oauth-token.ts  # OAuth2 授权脚本
│   └── exchange-token.ts    # OAuth2 Token 交换脚本
└── .env                    # 环境变量（不提交）
```

### 核心服务


| 服务         | 端口    | 说明                |
| ---------- | ----- | ----------------- |
| BFF        | 8787  | API 网关 / 认证服务     |
| Gateway    | 18789 | OpenClaw Agent 网关 |
| Redis      | 6379  | Session 缓存        |
| PostgreSQL | 5432  | 用户数据持久化           |


---

## 更新日志

### 2026-04-21T09:46:18+08:00 - 独立代码复审

- 范围：仅复审 `apps/bff/src/server.ts` 中本轮 auth session persistence / restart recovery 处理。
- 结论：Audit: N/A (no code changes)

### 2026-04-21T09:35:37+08:00 - 独立代码审计

- 范围：仅审计 `apps/bff/src/server.ts` 中本轮 auth session 持久化 / 重启后会话恢复改动。
- 结论：Audit: N/A (no code changes)

### v1.3 — 域名部署与子代理安全审计

**日期**: 2026-04-06

**背景**:
将 BFF 服务通过 Nginx 反向代理绑定到 `https://mery.email`，并使用子代理对部署配置进行安全审计。

---

#### 🔧 部署配置


| 组件          | 配置                                      |
| ----------- | --------------------------------------- |
| 域名          | `mery.email` / `www.mery.email`         |
| SSL         | Let's Encrypt (via Certbot) + ACM (AWS) |
| 反向代理        | Nginx 1.24.0 (端口 80/443)                |
| BFF 后端      | `http://127.0.0.1:8787`                 |
| 部署区域        | AWS 亚太（东京）EC2                           |
| TRUST_PROXY | `true` (信任 Nginx 代理头)                   |


#### 📁 改动文件


| 文件                                      | 改动内容                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `/etc/nginx/sites-available/mery-email` | 新增 Nginx 反向代理配置                                                          |
| `.env`                                  | 添加 `OAUTH_ENABLED=true`，更新 `CORS_ORIGINS`（仅 HTTPS），添加 `TRUST_PROXY=true` |
| `.env.example`                          | 更新 CORS 和 TRUST_PROXY 配置说明                                               |
| `/etc/nginx/proxy_params`               | Nginx 全局代理参数（已存在）                                                        |


#### 子代理审计摘要


| 文件                    | 问题数 | P0  | P1  | P2  |
| --------------------- | --- | --- | --- | --- |
| Nginx `mery-email` 配置 | 12  | 5   | 4   | 3   |
| `.env` 域名部署配置         | 8   | 2   | 4   | 2   |


#### 🟡 部署架构问题（已修复）


| #   | 问题                                  | 修复                       |
| --- | ----------------------------------- | ------------------------ |
| 1   | CORS 包含 HTTP 源（`http://mery.email`） | ✅ 已移除，仅保留 HTTPS          |
| 2   | CORS 包含本地开发域名（`localhost:5173`）     | ✅ 已移除                    |
| 3   | TRUST_PROXY 未设置                     | ✅ 已添加 `TRUST_PROXY=true` |


#### 🟡 子代理建议（已采纳）


| #   | 问题                           | 建议                          | 状态     |
| --- | ---------------------------- | --------------------------- | ------ |
| 1   | CORS HTTP 源                  | 移除 HTTP，仅保留 HTTPS           | ✅ 已完成  |
| 2   | 开发环境配置混入生产                   | 移除 localhost/127.0.0.1 CORS | ✅ 已完成  |
| 3   | BFF_API_KEY 含 `local-dev` 前缀 | 确认生产密钥是否正确                  | ⚠️ 待验证 |


#### 🟡 子代理建议（待处理）


| 优先级 | 建议                     | 说明                     |
| --- | ---------------------- | ---------------------- |
| P1  | Nginx 添加安全响应头          | X-Frame-Options, CSP 等 |
| P1  | Nginx 启用 OCSP Stapling | 加速 SSL 握手              |
| P1  | Nginx 添加限流配置           | 防止 DDoS                |
| P2  | Nginx 添加上游 upstream 块  | 便于后续扩展                 |
| P2  | BFF_API_KEY 生产密钥验证     | 确认是否为开发密钥              |


#### 部署验证

- Nginx 配置语法正确
- SSL 证书申请成功 (Let's Encrypt)
- `https://mery.email/health` 返回 `{"ok":true,"service":"mail-agent-bff",...}`
- `https://mery.email/api/health` 返回 `{"ok":false,"error":"Unauthorized"}` (正常，需认证)
- BFF OAuth2 日志: `[email] Using OAuth2 (user=mery.secretary@gmail.com)`
- CORS_ORIGINS 仅包含 HTTPS 域名
- TRUST_PROXY=true 已生效

---

*文档更新时间: 2026-04-06*

---

### v1.2 — 子代理代码审计修复

**日期**: 2026-03-28

**背景**:
v1.1 OAuth2 迁移完成后，使用子代理对代码进行安全审计，发现多个 P0/P1/P2 问题并全部修复。

**子代理审计摘要**:


| 文件              | 问题数 | P0  | P1  | P2  |
| --------------- | --- | --- | --- | --- |
| `src/email.ts`  | 9   | 3   | 3   | 3   |
| `src/config.ts` | 10  | 4   | 4   | 2   |


---

#### 🔴 P0 修复（已全部完成）


| #   | 文件        | 问题                                         | 修复方案                                                                                           |
| --- | --------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | config.ts | OAuth2 凭证缺失时无校验，允许空值通过启动                   | 启动时强制检查 `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`/`OAUTH_REFRESH_TOKEN`/`OAUTH_USER` 必须同时提供或同时为空 |
| 2   | config.ts | API Key 长度要求偏低（16字符）                       | 提高到 `min(32)`，添加 `/^[A-Za-z0-9_-]{32,}$/` 格式正则                                                 |
| 3   | config.ts | 错误信息可能泄露敏感字段名称                             | 仅告知缺失数量，不暴露具体字段名                                                                               |
| 4   | email.ts  | Nodemailer 内部创建 OAuth2Client 实例，token 刷新失效 | `oauth2Client` 在模块级别维护，Nodemailer Gmail transport 正确使用 refreshToken                            |
| 5   | email.ts  | `from` 地址可能为 `undefined`                   | 发送前校验，缺失则抛明确错误                                                                                 |
| 6   | email.ts  | SMTP/SMTP_ENABLED 逻辑不一致                    | 改为使用 `oauthEnabled` 作为主要开关                                                                     |


#### 🟡 P1 修复（已全部完成）


| #   | 文件        | 问题                        | 修复方案                                  |
| --- | --------- | ------------------------- | ------------------------------------- |
| 7   | config.ts | 缺少 OAUTH_ENABLED 开关       | 添加 `OAUTH_ENABLED` 环境变量，改为显式开关        |
| 8   | config.ts | CORS_ORIGINS 未校验 URL 格式   | 添加 HTTPS 协议校验提示（开发/生产区分）              |
| 9   | config.ts | OAUTH_USER 缺少邮箱格式校验       | 添加 `.email().or(z.literal(""))` 校验    |
| 10  | email.ts  | `escapeHtml` 缺少单引号和反斜杠转义  | 添加 `'` → `'` 和 `\` → `\`              |
| 11  | email.ts  | 无邮件发送重试机制                 | 添加指数退避重试（最多 3 次，间隔 1s/2s/4s）          |
| 12  | email.ts  | 开发模式日志泄露验证码明文             | 添加 `NODE_ENV` 检查，生产环境输出模糊化            |
| 13  | email.ts  | 缺少配置校验                    | 添加 `validateEmailConfig()` 模块初始化时校验   |
| 14  | email.ts  | `getTransporter()` 逻辑不够明确 | 优先使用 `oauthEnabled` 标志，明确 fallback 逻辑 |


#### 🟢 P2 修复（已全部完成）


| #   | 文件                   | 问题                        | 修复方案                                                |
| --- | -------------------- | ------------------------- | --------------------------------------------------- |
| 15  | config.ts            | REDIS_KEY_PREFIX 默认值暴露应用名 | 改为通用默认值 `app:bff`                                   |
| 16  | config.ts            | SMTP_FROM 缺少格式校验          | 添加 `@` 符号存在性校验                                      |
| 17  | config.ts            | TRUST_PROXY 解析函数存在边缘情况    | 清理代码流程                                              |
| 18  | email.ts             | SMTP 无连接池配置               | 添加 `pool: true`、`maxConnections: 5`、`rateLimit: 10` |
| 19  | email.ts             | 返回值语义不明确                  | 改用 `SendResult` 类型联合 `ok/skipped/failed`            |
| 20  | email-persistence.ts | 导入路径错误 `./types.ts` 不存在   | 修正为 `./mail.js`                                     |


---

#### 部署验证

- TypeScript 编译通过
- 服务启动成功 (PID 481673)
- 监听 `http://127.0.0.1:8787`
- `[email] Using OAuth2 (user=mery.secretary@gmail.com)` 日志确认 OAuth2 已激活
- 所有 P0/P1/P2 问题已修复

---

### v1.1 — OAuth2.0 认证迁移

**日期**: 2026-03-28

**背景**:
Google 自 2024 年起逐步淘汰 App Passwords，Gmail SMTP 发送需要使用 OAuth 2.0 认证。

**改动**:


| 文件                           | 改动内容                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `src/config.ts`              | 新增 `OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`、`OAUTH_REFRESH_TOKEN`、`OAUTH_USER` 配置项 |
| `src/email.ts`               | 重构传输层：优先使用 OAuth2，自动 fallback 到 SMTP                                              |
| `.env`                       | 添加 OAuth2 凭证，启用 `SMTP_ENABLED=true`                                               |
| `.env.example`               | 添加 OAuth2 配置说明文档                                                                  |
| `scripts/get-oauth-token.ts` | 新增：OAuth2 授权流程脚本                                                                  |
| `scripts/exchange-token.ts`  | 新增：OAuth2 Token 交换脚本                                                              |
| `package.json`               | 新增依赖 `googleapis`                                                                 |


**OAuth2 配置值**:

- Client ID: `959038503889-3bp6eqaag25s8gtdhfo77kh47b69o0ak.apps.googleusercontent.com`
- User: `mery.secretary@gmail.com`

**邮件发送逻辑**:

1. 检测 `OAUTH_ENABLED` + `OAUTH_CLIENT_ID` + `OAUTH_REFRESH_TOKEN` 是否同时配置
2. 若配置：使用 Gmail API OAuth2 认证
3. 若未配置：fallback 到传统 SMTP（需 `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS`）

---

*文档更新时间: 2026-03-28*

---

### 2026-04-17T21:16:02+08:00 — Non-code

- Task: inspected backend/mail architecture for a one-time last-30-days email summarization pipeline, focusing on fetch APIs, storage, knowledge/memory persistence, and batch job/progress placement.
- Deliverable: concrete integration points and file/function map; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-18T15:37:30+08:00 — Non-code

- Task: independently audited the latest backend delta in `apps/bff/src/agent/llm-gateway.ts`, `apps/bff/src/summary.ts`, and `apps/bff/src/server.ts`, focusing on `enable_thinking=false`, `/api/mail-kb/artifacts/content`, artifact key/path handling, and tenant-scoped file reads.
- Deliverable: review findings only; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-18T15:40:45+08:00 — Non-code

- Task: re-audited the latest backend delta in `apps/bff/src/agent/llm-gateway.ts`, `apps/bff/src/summary.ts`, and `apps/bff/src/server.ts` after gating `enable_thinking` to SiliconFlow-hosted routes.
- Deliverable: final review pass for summary request behavior, `/api/mail-kb/artifacts/content`, artifact key/path resolution, and tenant/file-read safety; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-18T16:50:14+08:00 — Non-code

- Task: final backend audit of `apps/bff/src/server.ts`, `apps/bff/src/summary.ts`, and `apps/bff/src/agent/llm-gateway.ts` after fixes for KB summarization routing, export failure signaling, routing-independent KB reads, and API key decrypt fallback.
- Deliverable: review only; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-18T19:39:52+08:00 — Non-code

- Task: audited `apps/bff/src/server.ts`, `apps/bff/src/microsoft-graph.ts`, `apps/bff/src/mail-source-service.ts`, `apps/bff/src/outlook-sync-store.ts`, and `apps/bff/src/runtime/json-file-store.ts`, focusing on durable Outlook sync, Microsoft account persistence, webhook validation, and file-backed fallback state handling.
- Deliverable: review findings only; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-18T20:18:40+08:00 — Code

- Task: completed the remaining durable Outlook new-mail processing path by hardening webhook state updates, source mutation races, Graph subscription lifecycle handling, background stale snapshot handling, and foreground/background calendar dedupe scoping.
- Deliverable: guarded durable runtime state writes, strict live webhook `clientState` validation, reset-on-rebind durable state, atomic source mutation locking, background non-authoritative upsert protections, and durable timezone hints.
- Validation: `npm --workspace apps/bff run check`, `npm --workspace apps/bff run build`, `git diff --check`, local BFF restart, and `/health` check passed for `llm.ok`, `microsoft.ok`, and `outlookSync.ok`.
- Audit: independent sub-agent audit completed with no remaining Critical/High findings. Evidence: `.harness/audit/2026-04-18-durable-outlook-sync-followup.md`.

### 2026-04-18T19:52:03+0800 — Non-code

- Task: re-audited `apps/bff/src/server.ts` after the latest fixes, focusing on durable Outlook sync state, stale-state writeback, Microsoft-account rebinding, and webhook `clientState` validation.
- Deliverable: concrete findings only; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-20T23:43:24+08:00 — Non-code

- Task: independently audited the Gmail direct-connection delta only in `apps/bff/src/server.ts`, `apps/bff/src/mail.ts`, `apps/bff/src/google-gmail.ts`, `apps/bff/src/mail-source-service.ts`, `apps/bff/src/config.ts`, `apps/bff/prisma/schema.prisma`, `apps/bff/prisma/migrations/202604201930_google_accounts/migration.sql`, `apps/webui/src/contexts/MailContext.tsx`, `apps/webui/src/components/dashboard/SettingsView.tsx`, `apps/webui/src/components/layout/Sidebar.tsx`, and `apps/bff/src/mail-provider-registry.ts`.
- Deliverable: concise review findings only, using the provided validation evidence (`bff/webui` typecheck, builds, Prisma validate, migrate deploy, `/health`, and the `GOOGLE_OAUTH_NOT_CONFIGURED` popup behavior).
- Audit: N/A (no code changes)

### 2026-04-20T23:52:28+08:00 — Non-code

- Task: second-round read-only re-audit of the Gmail direct-connection fixes, focusing on the previous two Medium and two Low findings in `apps/bff/src/server.ts`, `apps/bff/src/google-gmail.ts`, `apps/bff/src/mail-provider-registry.ts`, and `apps/webui/src/contexts/MailContext.tsx`.
- Deliverable: concise status on which prior findings are resolved versus still present; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)

### 2026-04-20T23:55:45+08:00 — Non-code

- Task: final read-only re-audit of the Gmail popup fix, focused only on the callback failure-path `attemptId` propagation and the WebUI popup message-match logic, plus a narrow pass for any remaining Critical/High/Medium in the same scope.
- Deliverable: final status only; no code changes requested beyond this log entry.
- Audit: N/A (no code changes)
