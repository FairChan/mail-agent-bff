# MCP 配置说明

> Harness update: prefer `.cursor/mcp.json` as the active Cursor config.
> `.cursor/mcp-servers.json` is kept compatible but now uses `openclaw-mcp@1.3.1` instead of the unpublished `openclaw-mcp-gateway`.
> Optional credentialed servers live in `.cursor/mcp.optional.json`.
> Run `npm run harness:mcp:check` after changes.

## 1. OpenClaw Gateway MCP 桥接

### 安装 OpenClaw MCP Server

```bash
npm install -g openclaw-mcp@1.3.1
```

### 在 Cursor 中配置

1. 打开 Cursor 设置 (快捷键: `Ctrl+,`)
2. 选择 **MCP** 选项卡
3. 点击 **Add new MCP Server**
4. 填写以下配置:

```
名称: openclaw-gateway
类型: Command
命令: npx
参数: -y openclaw-mcp@1.3.1
环境变量:
  OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
  OPENCLAW_GATEWAY_TOKEN=<read from your local OpenClaw config; rotate if it was ever committed>
```

### 可用工具

配置成功后，你可以直接让 Cursor AI:
- "调用 OpenClaw 查询邮件列表"
- "触发邮件总结任务"
- "检查 Gateway 状态"

---

## 2. 业务级 MCP 工具

### 邮件处理 MCP (email-mcp)

```bash
npx -y email-mcp-server
```

配置参数:
```
名称: email-mcp
类型: Command  
命令: npx
参数: -y email-mcp-server
```

### PDF 解析 MCP

```bash
npx -y @sylphx/pdf-reader-mcp
```

### Google Calendar MCP

需要 OAuth2 认证，请参考官方文档配置。

---

## 3. CLI 联动

### 统一包管理

在终端中使用以下命令管理 OpenClaw 技能:

```bash
# 查看已安装技能
openclaw skills list

# 安装新技能
openclaw skills install <skill-slug>

# 安装 cursor-agent 技能
openclaw skills install cursor-agent
```

### 验证 Gateway 状态

```bash
curl -s http://127.0.0.1:18789/health
```

---

## 故障排除

### MCP 服务器无法启动

1. 检查 Node.js 版本 (需要 v18+)
2. 检查 npx 是否可用
3. 查看终端错误日志

### Token 认证失败

1. 检查 `OPENCLAW_GATEWAY_TOKEN` 环境变量
2. 确认 Gateway 配置中的 token 与代码中一致
