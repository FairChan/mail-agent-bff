# Mail Agent 工作台 - 项目架构文档

> 本文档记录项目每次更新的架构变更和关键决策。

## 更新日志

### 2026-04-13 - MCP 配置与邮件知识库系统

#### MCP 服务器配置

在云端服务器统一配置了 8 个 MCP 服务器，配置文件位于 `/root/.cursor/mcp.json`：

| MCP 服务器 | 类型 | 状态 |
|-----------|------|------|
| `openclaw-gateway` | 本地源码 | ✅ 运行中 |
| `openclaw-molt-mcp` | 本地 venv | ✅ 可用 |
| `composio` | 全局安装 | ✅ API Key 已配置 |
| `email-mcp` | 全局安装 | ⚠️ 需配置邮箱凭证 |
| `pdf-reader-mcp` | npx 运行时 | ✅ 可用 |
| `mcp-google-workspace` | 本地源码 | ⚠️ 需 OAuth 认证 |
| `openclaw-mcp` | 全局安装 | ✅ 可用 |

#### 邮件知识库代码审计与修复

**审计问题修复：**

1. **评分标准统一** (`mail-kb-service.ts`)
   - 问题：`summary.ts` 输出 0-1，`mail-kb-service.ts` 期望 1-10
   - 修复：统一为 0-1，与 Prisma Schema 一致

2. **事件聚类版本控制** (`mail-kb-service.ts`)
   - 问题：合并旧邮件时直接覆盖 `summary`，导致历史信息丢失
   - 修复：追加更新格式 `[日期] 新内容\n\n---\n[历史] 旧内容`

3. **发件人画像增强** (`mail-kb-service.ts`)
   - 新增 `keyInfo` 字段（字符串数组）
   - 总结追加更新而非覆盖
   - 重要度取 max（非覆盖）

4. **SSE 实时日志流** (`server.ts`)
   - 新增端点：`GET /api/mail/knowledge-base/jobs/:jobId/stream`
   - 用于前端可视化窗口实时显示处理进度

5. **类型一致性修复**
   - `mail-kb-export.ts`: 添加缺失的 `keyInfo` 字段
   - `server.ts`: 修复 `upsertPersonSchema` 的类型定义

#### 子代理代码审计修复

**审计发现的问题及修复：**

1. **SSE 端点越权漏洞** (高优先级)
   - 问题：未验证 `sourceId`，用户可访问他人 Job 数据
   - 修复：添加 `sourceId` 验证

2. **ID 生成冲突风险**
   - 问题：`Math.random()` 仅 1000 个唯一值，高并发会冲突
   - 修复：增加时间戳到毫秒级 + 4 位随机

3. **Job 内存泄漏**
   - 问题：`completed/failed` 状态的 Job 永久保留
   - 修复：添加 24 小时 TTL 自动清理

#### 新增文件

| 文件路径 | 描述 |
|---------|------|
| `skills/mail-kb-skill/SKILL.md` | 邮件知识库管理 Skill 定义 |
| `webui/src/components/dashboard/MailKBSummaryModal.tsx` | SSE 进度可视化 Modal 组件 |
| `webui/src/components/dashboard/knowledgebase/KnowledgeBaseView.tsx` | 集成进度 Modal + 归纳按钮 |

---

## 项目架构总览

```
/root/.openclaw/
├── workspace/                    # 用户工作区
│   ├── apps/
│   │   └── bff/                  # Backend-For-Frontend (Hono + TypeScript)
│   │       ├── src/
│   │       │   ├── server.ts           # HTTP 服务器入口
│   │       │   ├── mail.ts             # Outlook API 封装
│   │       │   ├── email.ts            # 邮件发送服务
│   │       │   ├── summary.ts         # 邮件智能总结核心
│   │       │   ├── mail-analysis.ts   # AI 分析管道
│   │       │   ├── mail-kb-service.ts # 知识库数据服务
│   │       │   ├── mail-kb-export.ts  # Markdown 导出
│   │       │   ├── knowledge-base-service.ts  # 任务调度
│   │       │   ├── gateway.ts          # OpenClaw Gateway 调用
│   │       │   ├── config.ts          # 配置管理
│   │       │   └── webhook-handler.ts  # Webhook 处理
│   │       └── prisma/
│   │           └── schema.prisma      # 数据模型
│   ├── skills/
│   │   ├── email-reader/              # 邮件读取技能
│   │   ├── imap-email/                # IMAP 协议客户端
│   │   ├── mail-knowledge-base/       # 知识库管理
│   │   ├── mail-knowledge-processor/   # 邮件处理器
│   │   ├── github/
│   │   └── ...
│   └── memory/
│       ├── contacts/                  # 联系人记忆
│       ├── events/                   # 事件记忆
│       └── identifiers/               # 标识码管理
├── extensions/
│   ├── openclaw-cursor-brain/        # MCP Server (Gateway 桥接)
│   ├── composio/                     # Composio 插件 (1000+ 工具)
│   ├── adp-openclaw/
│   └── skillhub/
└── tools/
    └── mcp-python/
        └── .venv/lib/python3.12/site-packages/openclaw_molt_mcp/
                                                    # Python MCP Server
```

---

## 核心数据模型

### Prisma Schema (PostgreSQL)

```
User
  └── MailSource (邮箱账户)
        └── MailSummary (邮件总结)
              ├── MailScoreIndex (评分索引)
              ├── SenderProfile (发件人画像)
              │     └── keyInfo: JSON  # 重要属性
              └── MailEvent (事件聚类)
                    ├── keyInfo: JSON
                    └── 关联邮件列表
```

### 标识码生成规则

| 类型 | 格式 | 算法 |
|------|------|------|
| 邮件 | `MSG_{hash}` | `stableHash(sourceId + "::" + externalMsgId)` |
| 事件 | `EVT_{hash}` | `stableHash(userId + "::" + eventHash)` |
| 发件人 | `PER_{hash}` | `stableHash(userId + "::" + email)` |

### 评分标准

- **重要性 (importanceScore)**: 0-1
- **紧急性 (urgencyScore)**: 0-1
- **象限分类**:
  - `urgent_important`: 重要且紧急
  - `not_urgent_important`: 重要不紧急
  - `urgent_not_important`: 紧急不重要
  - `not_urgent_not_important`: 不紧急不重要

---

## 邮件处理流程

```
用户触发
    │
    ▼
triggerMailSummary()
    │
    ├─► 1. 获取邮件 (queryInboxMessagesForSource)
    │       │
    │       ▼
    ├─► 2. 增量过滤 (跳过已处理邮件)
    │       │
    │       ▼
    ├─► 3. 加载已有事件/发件人
    │       │
    │       ▼
    ├─► 4. 批量 AI 分析 (analyzeMailsWithAgent)
    │       │   - 生成标识码
    │       │   - 评分 (0-1)
    │       │   - 事件聚类
    │       │   - 发件人画像
    │       │
    │       ▼
    ├─► 5. 持久化到 Prisma
    │       │
    │       ▼
    └─► 6. 导出 Markdown 文档
            │
            ▼
        完成 / 失败
```

---

## Skill 系统

### Skill 定义规范

每个 Skill 包含：
- `SKILL.md` - 技能定义（触发条件、描述、工作流）
- `references/` - 参考文档
- `scripts/` - 可执行脚本

### 现有 Skill

| Skill | 描述 |
|-------|------|
| `email-reader` | 邮件读取与管理（himalaya CLI） |
| `imap-email` | IMAP 协议客户端（Node.js） |
| `mail-knowledge-base` | 知识库管理（数据模型定义） |
| `mail-knowledge-processor` | 邮件处理器（BFF API 调用） |
| `github` | GitHub 集成 |

---

## API 端点

### 邮件相关

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/mail/inbox` | 获取邮件列表 |
| GET | `/api/mail/:id` | 获取邮件详情 |
| GET | `/api/mail/:id/body` | 获取邮件正文 |
| POST | `/api/mail/send` | 发送邮件 |
| GET | `/api/mail/triage` | 邮件分类（四象限） |

### 知识库相关

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/mail-kb/trigger` | 触发邮件总结 |
| GET | `/api/mail-kb/jobs/:id` | 获取 Job 状态 |
| GET | `/api/mail-kb/mails` | 查询邮件列表 |
| GET | `/api/mail-kb/events` | 查询事件列表 |
| GET | `/api/mail-kb/persons` | 查询发件人列表 |
| GET | `/api/mail-kb/export` | 导出 Markdown |

---

## MCP 集成

### OpenClaw Gateway

- 地址: `http://127.0.0.1:18789`
- Token: `7e9bc73ebfb5e3f42d847324a9b75e94d39e24ad0eddc2ea`
- 工具: `full`, `composio`, `composio_mcp`, `cursor_brain`

### Composio

- 集成方式: OpenClaw 插件
- API Key: `ak_j0YRUvPtE-akAh30WISo`
- 功能: 1000+ 第三方工具

---

## 注意事项

1. **评分标准**: 所有评分统一使用 0-1 范围
2. **版本控制**: 事件聚类和发件人画像更新时追加而非覆盖
3. **标识码**: 使用稳定哈希算法，保证同一内容生成相同 ID
4. **OAuth 认证**: Google Workspace MCP 需要 OAuth 认证文件
