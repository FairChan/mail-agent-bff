# Cursor MCP 配置指南

> Harness update: the active local config now lives in `.cursor/mcp.json`.
> Local/no-secret additions are `filesystem` and `playwright`.
> Credentialed or external servers are staged in `.cursor/mcp.optional.json` and should only be activated after credentials are intentionally supplied.
> Run `npm run harness:mcp:check` after editing MCP config.

## 第一步：在 Cursor 中添加 MCP 服务器

### 1. 打开 Cursor 设置

- 快捷键: `Ctrl + ,` (Windows/Linux) 或 `Cmd + ,` (macOS)
- 或点击左下角设置图标

### 2. 选择 MCP 选项卡

在设置中搜索 "MCP" 或找到 "MCP Servers" 选项

### 3. 添加 OpenClaw Gateway 桥接

点击 **Add new MCP Server**，填写以下信息：

```
名称: openclaw-gateway
类型: Command
命令: npx
参数: -y openclaw-mcp@1.3.1
```

### 4. 环境变量配置

在环境变量中添加：

```
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<read from your local OpenClaw config; rotate if it was ever committed>
```

---

## 第二步：安装业务级 MCP 工具

### 邮件处理 MCP (email-mcp)

在 Cursor MCP 设置中添加：

```
名称: email-mcp
类型: Command
命令: npx
参数: -y email-mcp-server
```

### PDF 解析 MCP

```
名称: pdf-reader
类型: Command
命令: npx
参数: -y @sylphx/pdf-reader-mcp
```

### Google Calendar MCP

```
名称: google-calendar
类型: Command
命令: npx
参数: -y @modelcontextprotocol/server-google-calendar
```

---

## 第三步：验证配置

### 检查 MCP 状态

1. 打开 Cursor 设置
2. 找到 MCP 选项卡
3. 查看各服务器状态（绿色 = 正常）

### 测试工具调用

在 Cursor AI 中输入：

```
请帮我检查 OpenClaw Gateway 的健康状态
```

---

## 可用工具列表

配置成功后，可使用以下工具：

### OpenClaw Gateway 工具

| 工具名称 | 功能描述 |
|---------|---------|
| `gateway_health` | 检查 Gateway 健康状态 |
| `gateway_sessions_spawn` | 启动子 Agent 会话 |
| `gateway_sessions_list` | 列出所有子会话 |
| `gateway_invoke_tool` | 调用任意 Gateway 工具 |
| `gateway_query_agent` | 向 Agent 发送消息 |

### 邮件处理工具

| 工具名称 | 功能描述 |
|---------|---------|
| `email_search` | 搜索邮件 |
| `email_read` | 读取邮件内容 |
| `email_send` | 发送邮件 |

---

## 常见问题

### Q: MCP 服务器显示红色/不可用

1. 检查命令路径是否正确
2. 确认 Node.js 已安装 (v18+)
3. 查看 Cursor 终端日志

### Q: Token 认证失败

确认 `OPENCLAW_GATEWAY_TOKEN` 与 `~/.openclaw/openclaw.json` 中的 token 一致

### Q: 无法连接到 Gateway

确认 Gateway 正在运行：

```bash
curl http://127.0.0.1:18789/health
```

---

## CLI 联动命令

### 管理 OpenClaw 技能

```bash
# 列出已安装技能
openclaw skills list

# 检查技能状态
openclaw skills check

# 查看技能详情
openclaw skills info <skill-name>
```

### 验证 Gateway 状态

```bash
curl -s http://127.0.0.1:18789/health | jq
```
