# 监控与告警

## 架构

```
┌─────────────┐    ┌──────────────┐    ┌────────────────┐
│ Mery BFF    │───▶│ Prometheus   │───▶│ AlertManager   │
│ /metrics    │    │ (抓取指标)   │    │ (告警路由)     │
└─────────────┘    └──────────────┘    └────────────────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           ▼                   ▼                   ▼
                      Email/Slack          PagerDuty           Webhook
                      devops@             oncall@              自定义
```

## 告警规则

| 告警名称 | 条件 | 严重度 | 说明 |
|---------|------|--------|------|
| HighHTTPErrorRate | 错误率 > 5% | Critical | HTTP 请求错误率过高 |
| HighLatency | P95 延迟 > 1s | Warning | 服务响应时间过长 |
| HighAuthFailureRate | 认证失败率 > 20% | Warning | 认证失败率异常（可能的暴力攻击） |
| BFFDown | 服务不可达 | Critical | BFF 服务宕机 |
| HighMemoryUsage | 内存使用 > 90% | Warning | 内存使用率过高 |
| HighCPUUsage | CPU 使用 > 90% | Warning | CPU 使用率过高 |
| LowDiskSpace | 磁盘空间 < 10% | Critical | 磁盘空间不足 |
| HighProcessRestarts | 重启次数 > 5次/小时 | Warning | 进程频繁重启 |

## 告警响应流程

1. **Critical（严重）**：立即通知 on-call工程师，15分钟内响应
2. **Warning（警告）**：通知 devops 团队，工作时间4小时内响应

## 检查告警状态

```bash
# 本地检查
./monitoring/check-alerts.sh

# 指定 Prometheus URL
PROMETHEUS_URL=https://prometheus.true-sight.asia ./monitoring/check-alerts.sh
```

## 静默告警

如需临时静默告警：

```bash
# 通过 AlertManager API 静默
curl -X POST "http://alertmanager:9093/api/v2/silences" \
  -H 'Content-Type: application/json' \
  -d '{
    "matchers": [{"name":"alertname","value":"HighLatency"}],
    "startsAt": "2024-01-01T00:00:00Z",
    "endsAt": "2024-01-01T01:00:00Z",
    "createdBy": "admin@example.com",
    "comment": "Scheduled maintenance"
  }'
```

## 添加新告警

1. 编辑 `monitoring/alerts/bff-alerts.yaml`
2. 添加新的告警规则
3. 测试告警规则：`promtool check rules alerts/bff-alerts.yaml`
4. 重载 Prometheus：`curl -X POST http://prometheus:9090/-/reload`
