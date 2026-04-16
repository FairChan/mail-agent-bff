# Mery 部署检查清单

## 部署前检查

### 1. 环境准备
- [ ] Docker 20.10+ 已安装
- [ ] Docker Compose 2.0+ 已安装
- [ ] 所有环境变量已配置

### 2. 环境变量配置
```bash
# 创建 .env 文件
cp deploy/docker/.env.example deploy/docker/.env

# 必需的配置项：
DB_PASSWORD=<安全的数据库密码>
SESSION_SECRET=<64字符随机密钥>
NODE_ENV=production
```

### 3. GitHub Secrets 配置（CI/CD）
- [ ] `SSH_PRIVATE_KEY` - SSH 私钥（用于部署）
- [ ] `SSH_HOST` - 服务器地址
- [ ] `SSH_USER` - 服务器用户名
- [ ] `PROMETHEUS_URL` - Prometheus 服务器地址
- [ ] `ZAP_TARGET_URL` - ZAP 扫描目标
- [ ] `SLACK_WEBHOOK_URL` - Slack 告警 webhook
- [ ] `SMTP_PASSWORD` - 告警邮件密码

## 部署步骤

### Docker Compose 本地部署

```bash
# 1. 进入部署目录
cd deploy/docker

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 设置安全的密码

# 3. 启动服务
./deploy.sh

# 或手动启动
docker compose up -d

# 4. 验证服务
curl http://localhost:3000/api/health
curl http://localhost:8080/
```

### Kubernetes 部署

```bash
# 1. 确保 kubectl 已配置
kubectl config current-context

# 2. 应用配置
kubectl apply -k deploy/kubernetes/

# 3. 检查 Pod 状态
kubectl get pods -n mery -w

# 4. 获取外部 IP
kubectl get svc -n mery
```

## 验证清单

### 服务健康检查
- [ ] `GET /api/health` 返回 200 OK
- [ ] Redis 连接正常
- [ ] PostgreSQL 连接正常
- [ ] Gateway 连接正常

### 功能验证
- [ ] 用户可以注册
- [ ] 用户可以登录
- [ ] 邮件查询功能正常
- [ ] AI 摘要功能正常
- [ ] 日历同步功能正常

### 监控验证
- [ ] Prometheus 指标可访问 (`/api/metrics/prometheus`)
- [ ] 告警规则已加载
- [ ] Grafana 仪表板可访问（如果配置了）

## 回滚步骤

### Docker Compose 回滚
```bash
# 查看历史版本
docker compose ps

# 回滚到上一个版本
docker compose down
docker compose pull
docker compose up -d
```

### Kubernetes 回滚
```bash
# 查看部署历史
kubectl rollout history deployment/mery-bff -n mery

# 回滚到上一个版本
kubectl rollout undo deployment/mery-bff -n mery

# 回滚到指定版本
kubectl rollout undo deployment/mery-bff -n mery --to-revision=2
```

## 灾难恢复

### 数据库恢复
```bash
# 1. 停止服务
docker compose down

# 2. 恢复数据
./backups/postgres-restore.sh backups/postgres_20260408_020000.sql.gz

# 3. 启动服务
docker compose up -d
```

## 联系方式

- 开发团队: dev@true-sight.asia
- 安全问题: security@true-sight.asia
- 紧急响应: oncall@true-sight.asia
