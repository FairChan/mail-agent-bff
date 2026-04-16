# Mery BFF API 文档

## 概述

Mery BFF API 是 TrueSight 邮件 AI 助手的核心后端 API，提供认证、邮件查询、AI 摘要生成、日历同步等功能。

## 基础 URL

| 环境 | URL |
|------|-----|
| 生产环境 | `https://bff.true-sight.asia` |
| 预发环境 | `https://staging.true-sight.asia` |
| 本地开发 | `http://localhost:3000` |

## 认证

### Session Cookie

大多数 API 端点需要认证。登录成功后，服务器会设置 `bff_session` Cookie。

```bash
curl -X POST https://bff.true-sight.asia/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt
```

后续请求携带 Cookie：

```bash
curl https://bff.true-sight.asia/api/mail/query \
  -b cookies.txt
```

## 端点列表

### 健康检查

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/health` | 服务健康状态 |
| GET | `/api/metrics` | Prometheus 指标 |

### 认证

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/auth/register` | 注册新用户 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/request-verification-code` | 请求验证码 |

### 邮件

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/mail/query` | 查询邮件列表 |
| GET | `/api/mail/{id}` | 获取邮件详情 |
| POST | `/api/mail/ai-summary` | AI 摘要生成 |
| POST | `/api/mail/{id}/action` | 邮件操作（标记已读/删除等） |

### 日历

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/mail/calendar/events` | 获取日历事件 |
| POST | `/api/mail/calendar/sync` | 同步日历 |
| POST | `/api/mail/calendar/event` | 创建日历事件 |

## 错误代码

| 代码 | HTTP 状态 | 说明 |
|------|-----------|------|
| `INVALID_CREDENTIALS` | 401 | 邮箱或密码错误 |
| `SESSION_EXPIRED` | 401 | 会话已过期 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求过于频繁 |
| `GATEWAY_TIMEOUT` | 504 | AI 服务超时 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

## 速率限制

| 端点 | 限制 |
|------|------|
| `/api/auth/login` | 10 次/分钟 |
| `/api/mail/query` | 60 次/分钟 |
| `/api/mail/ai-summary` | 20 次/分钟 |
| 其他 | 300 次/分钟 |

## API 文档

在线 Swagger UI: https://bff.true-sight.asia/api-docs/

## SDK

- JavaScript/TypeScript: 参见 `apps/webui/src/utils/api.ts`
- Python: 即将支持

## 支持

如有问题请联系: dev@true-sight.asia