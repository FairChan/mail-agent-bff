---
name: mail-kb-skill
version: 1.0.0
description: 邮件知识库管理技能 - 对旧有邮件和新邮件进行总结归纳、事件聚类、发件人画像。当用户要求"总结邮件"、"整理历史邮件"、"归纳邮件"时触发。
---

# Mail Knowledge Base Skill - 邮件知识库管理

## 概述

对用户邮箱中的旧有邮件进行完整的总结归纳，建立邮件知识库，支持事件聚类和发件人画像追踪。

## 触发场景

1. 用户说"帮我总结近一个月的邮件"
2. 用户说"归纳一下我的历史邮件"
3. 用户说"整理旧邮件，建立知识库"
4. 用户说"把邮件按事件分类"
5. 用户切换到"知识库"视图

## 功能模块

### 1. 邮件唯一标识码生成

为每封邮件生成唯一标识码（身份证），格式：`MSG_{hash}`

- 基于邮件源ID和外部消息ID的哈希
- 稳定可复现：同一封邮件始终生成相同ID
- 所有标识码存储在 `mail-ids.md` 文档中

### 2. 邮件题目索引

所有题目和对应的标识码存储在 `mail-subject-index.md`：
- 用于快速定位和浏览
- 按接收时间排序

### 3. 邮件评分系统

根据重要性(importanceScore)和紧急性(urgencyScore)打分(0-1)：
- `urgent_important`: 重要且紧急
- `not_urgent_important`: 重要不紧急
- `urgent_not_important`: 紧急不重要
- `not_urgent_not_important`: 不紧急不重要

评分和标识码存储在 `mail-score-index.md`

### 4. 事件聚类

对邮件事件进行聚类，同一事件的多封邮件共享事件ID：
- 新邮件到来时检查是否属于已有事件
- 事件标识码：`EVT_{hash}`
- 事件归纳总结和重要信息存储在 `event-clusters.md`
- 支持版本控制：新邮件追加到已有事件而非覆盖

### 5. 发件人画像

对发件人建立脸谱画像：
- 发件人标识码：`PER_{hash}`
- 人物归纳总结存储在 `sender-profiles.md`
- 支持版本控制：人物画像追加更新
- 存储重要属性（职位、组织、专长等）到 keyInfo

## 工作流程

### Phase 1: 触发总结

```bash
# 通过 OpenClaw Gateway 触发
curl -X POST http://127.0.0.1:18789/api/mail-kb/trigger \
  -H "Authorization: Bearer {token}"
```

### Phase 2: 获取邮件

使用 Composio MCP 的 `OUTLOOK_QUERY_EMAILS` 获取近30天邮件：
- 时间过滤：`received:>=30daysAgo`
- 批量处理：每批20-30封

### Phase 3: AI 分析

对每封邮件生成：
```json
{
  "mailId": "MSG_xxxxxx",
  "summaryText": "中文归纳总结",
  "importanceScore": 0.0-1.0,
  "urgencyScore": 0.0-1.0,
  "quadrant": "象限名称",
  "eventId": "EVT_xxxxxx或null",
  "personId": "PER_xxxxxx"
}
```

### Phase 4: 持久化

1. 存储到 Prisma (PostgreSQL)
2. 导出到 Markdown 文档

### Phase 5: 生成索引文档

生成以下文档：
- `mail-ids.md` - 标识码清单
- `mail-subject-index.md` - 题目索引
- `mail-score-index.md` - 评分索引
- `mail-summaries.md` - 总结正文库
- `event-clusters.md` - 事件聚类
- `sender-profiles.md` - 发件人画像

## 数据存储

### Prisma (主存储)

- `MailSummary` - 邮件总结
- `MailEvent` - 事件聚类
- `SenderProfile` - 发件人画像
- `MailScoreIndex` - 评分索引

### Markdown (备份/可读)

```
/root/.openclaw/workspace/mail-kb/
├── data/
│   ├── mails/
│   │   ├── index.json
│   │   └── MSG_xxxxxx.json
│   ├── events/
│   │   └── index.json
│   ├── persons/
│   │   └── index.json
│   └── documents/
│       ├── mail-ids.md
│       ├── mail-subject-index.md
│       ├── mail-score-index.md
│       ├── mail-summaries.md
│       ├── event-clusters.md
│       └── sender-profiles.md
└── baseline-status.json
```

## 输出示例

处理完成后输出：

```
✅ 邮件知识库更新完成

📧 邮件处理: {N} 封
📅 事件聚类: {新增} 个事件，{更新} 个事件
👤 人物画像: {新增} 个，{更新} 个

📊 象限分布:
- 紧急重要: {N} 封
- 重要不紧急: {N} 封
- 紧急不重要: {N} 封
- 不紧急不重要: {N} 封

查看详情: 访问 mail-kb/documents/
```

## 错误处理

| 错误 | 处理方式 |
|------|---------|
| Outlook 未连接 | 提示用户先连接邮箱 |
| Gateway 不可用 | 提示检查 OpenClaw Gateway |
| API 调用失败 | 重试 3 次后报错 |
| 邮件为空 | 告知用户暂无邮件数据 |

## 与其他技能的协作

- 使用 `email-reader` 读取邮件内容
- 使用 `composio_mcp` 调用 Outlook API
- 使用 `mail-knowledge-processor` 与 WebUI 交互
