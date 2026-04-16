# Mery 部署指南

## 环境要求

- Docker 20.10+
- Docker Compose 2.0+
- Kubernetes 1.24+ (可选)
- PostgreSQL 15+
- Redis 7+

## Docker Compose 部署

### 1. 准备环境变量

```bash
cd deploy/docker
cp .env.example .env
# 编辑 .env 文件，设置安全的密码和密钥
```

### 2. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f bff
```

### 3. 初始化数据库

```bash
# 运行数据库迁移
docker-compose exec bff npm run db:migrate

# 填充种子数据（可选）
docker-compose exec bff npm run db:seed
```

### 4. 验证部署

```bash
# 检查健康状态
curl http://localhost:3000/api/health

# 检查 WebUI
curl http://localhost:8080
```

## Kubernetes 部署

### 前提条件

- kubectl 配置完成
- ingress controller 已安装 (如 nginx-ingress)
- cert-manager 已安装 (可选，用于 TLS)

### 部署步骤

```bash
# 1. 应用配置
kubectl apply -k deploy/kubernetes/

# 2. 检查 Pod 状态
kubectl get pods -n mery -w

# 3. 查看日志
kubectl logs -n mery -l app=mery-bff -f

# 4. 获取外部 IP
kubectl get svc -n mery
```

### 更新版本

```bash
# 拉取新镜像
docker pull ghcr.io/true-sight/mery-bff:latest

# 重启 Deployment
kubectl rollout restart deployment/mery-bff -n mery

# 验证滚动更新
kubectl rollout status deployment/mery-bff -n mery
```

## 生产环境检查清单

- [ ] 使用 HTTPS/TLS 证书
- [ ] 配置防火墙规则
- [ ] 启用日志聚合
- [ ] 配置监控告警
- [ ] 设置数据库备份
- [ ] 配置 Redis 持久化
- [ ] 测试故障恢复
- [ ] 审查安全配置

## 故障排除

### Pod 无法启动

```bash
kubectl describe pod <pod-name> -n mery
kubectl logs <pod-name> -n mery
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 日志
kubectl logs -n mery -l app=postgres

# 测试连接
kubectl exec -it <pod-name> -n mery -- nc -zv postgres-svc 5432
```

### 查看资源使用

```bash
kubectl top pods -n mery
kubectl top nodes
```
