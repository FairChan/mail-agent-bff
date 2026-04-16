# 邮件知识库处理器 (Mail Knowledge Processor)

## 技能概述

当用户要求"总结邮件"、"归纳邮件"、"处理历史邮件"时激活此技能。此技能负责调用 BFF API 完成邮件历史总结归纳，并将结果投射到 WebUI 的知识库界面。

## 触发条件

满足以下任一条件时触发：
- 用户说"帮我总结邮件"
- 用户说"归纳一下我的邮件"
- 用户说"处理邮件历史"
- 用户说"把旧邮件整理一下"
- 用户切换到"知识库"视图

## 执行流程

### 步骤 1: 检查邮件源

1. 确认用户已登录并连接 Outlook 邮箱
2. 检查 OpenClaw 网关是否运行 (`http://127.0.0.1:18789`)
3. 确认 BFF 服务可用 (`http://127.0.0.1:18792`)

### 步骤 2: 调用邮件获取 API

通过 OpenClaw Gateway 的 `COMPOSIO_MULTI_EXECUTE_TOOL` 调用以下工具：

```
OUTLOOK_QUERY_EMAILS
参数：
- search_query: "received:>=30daysAgo"
- max_results: 500
- order_by: "receivedDateTime desc"
```

### 步骤 3: AI 逐封归纳

对每封邮件调用 AI 摘要，提取以下信息：

```json
{
  "mailId": "MAIL-自动生成",
  "rawId": "原始邮件ID",
  "subject": "邮件主题",
  "personId": "发件人ID",
  "eventId": "关联事件ID（可为null）",
  "importanceScore": 1-10,
  "urgencyScore": 1-10,
  "quadrant": "紧急重要|重要不紧急|紧急不重要|不紧急不重要",
  "summary": "AI归纳总结（100字以内）",
  "receivedAt": "接收时间ISO",
  "webLink": "邮件链接"
}
```

### 步骤 4: 事件聚类

识别邮件主题中的事件并进行聚类：

```json
{
  "name": "事件名称",
  "summary": "事件归纳总结",
  "keyInfo": ["关键信息1", "关键信息2"],
  "tags": ["标签1", "标签2"]
}
```

**聚类规则：**
- 新邮件到来时，检查是否存在相似事件
- 如果存在，合并到现有事件，更新 summary 和 keyInfo
- 如果不存在，创建新事件

### 步骤 5: 人物画像

为每个发件人建立画像：

```json
{
  "email": "发件人邮箱",
  "name": "发件人姓名",
  "profile": "人物归纳总结",
  "role": "角色/职位",
  "importance": 1-10
}
```

**画像更新规则：**
- 新邮件到来时，更新该人物的 recentInteractions
- 重新归纳 profile（如果 profile 发生变化）

### 步骤 6: 存储到 BFF API

将归纳结果存储到 BFF 端点：

```bash
# 存储邮件
POST /api/mail-kb/mails
Content-Type: application/json
Authorization: Bearer {token}

# 存储事件
POST /api/mail-kb/events

# 存储人物
POST /api/mail-kb/persons
```

### 步骤 7: 确认完成

告诉用户：
1. 总结完成，共处理 N 封邮件
2. 创建/更新了 N 个事件
3. 创建/更新了 N 个人物
4. 提示用户可在 WebUI 的"知识库"视图查看

## 输出要求

每次处理完成后，输出：

```
✅ 邮件知识库更新完成

📧 邮件处理: {新增} 封
📅 事件聚类: {新增} 个事件，{更新} 个事件
👤 人物画像: {新增} 个，{更新} 个

📊 象限分布:
- 紧急重要: N 封
- 重要不紧急: N 封
- 紧急不重要: N 封
- 不紧急不重要: N 封

查看详情: 访问 WebUI → 知识库
```

## 错误处理

| 错误 | 处理方式 |
|------|---------|
| Outlook 未连接 | 提示用户先连接邮箱 |
| 网关不可用 | 提示检查 OpenClaw Gateway |
| API 调用失败 | 重试 3 次后报错 |
| 邮件为空 | 告知用户暂无邮件���据 |

## 示例对话

**用户**: "帮我总结近一个月的邮件"

**AI**: 
1. "好的，我来帮您总结近一个月的邮件历史。首先检查邮件源..."
2. "正在获取邮件，共找到 156 封..."
3. "正在逐封归纳并聚类..."
4. ✅ "邮件知识库更新完成

📧 邮件处理: 156 封
📅 事件聚类: 8 个事件
👤 人物画像: 23 个

📊 象限分布:
- 紧急重要: 12 封
- 重要不紧急: 45 封
- 紧急不重要: 38 封
- 不紧急不重要: 61 封

您可以在 WebUI 的「知识库」视图中查看所有邮件、事件和人物画像的详细数据。"