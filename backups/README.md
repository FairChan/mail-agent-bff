# 数据备份策略

## 备份类型

### 全量备份
- **PostgreSQL**：使用 `pg_dump --format=custom` 创建二进制格式备份
- **Redis**：使用 `BGSAVE` 触发后台保存，然后复制 dump.rdb 文件

### 备份频率
| 类型 | 频率 | 保留时间 |
|------|------|---------|
| 每日备份 | 每天 02:00 | 7 天 |
| 周备份 | 每周日 03:00 | 30 天 |
| 月备份 | 每月 1 日 | 12 个月 |

## 存储位置

1. **本地存储**：`./backups/`
2. **S3 存储**：`s3://mery-backups/`（可选）
3. **远程服务器**：`$REMOTE_BACKUP_HOST:$REMOTE_BACKUP_PATH/`（可选）

## 恢复流程

### PostgreSQL 恢复

```bash
# 查看可用备份
ls -la backups/postgres_*.gz

# 恢复（会覆盖现有数据）
./backups/postgres-restore.sh backups/postgres_20260407_020000.sql.gz

# 预览恢复内容（不实际恢复）
./backups/postgres-restore.sh backups/postgres_20260407_020000.sql.gz --dry-run
```

### Redis 恢复

```bash
# 停止 Redis
sudo systemctl stop redis

# 替换 dump.rdb 文件
cp backups/redis_20260407_020000.gz /tmp/
gunzip /tmp/redis_20260407_020000.gz
sudo mv /var/lib/redis/dump.rdb /var/lib/redis/dump.rdb.old
sudo mv /tmp/redis_20260407_020000 /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb

# 启动 Redis
sudo systemctl start redis
```

## 备份监控

备份任务通过 GitHub Actions 或系统 cron 执行，完成后会生成日志文件。

### 检查备份状态

```bash
# 查看备份日志
cat backups/backup.log

# 检查最近备份
ls -la backups/ | tail -10

# 验证备份文件
zcat backups/postgres_latest.sql.gz | head -20
```

## 灾难恢复演练

建议每季度进行一次灾难恢复演练：

1. 在测试环境恢复备份
2. 验证数据完整性
3. 检查应用功能
4. 记录演练结果

## 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | PostgreSQL 主机 | localhost |
| `DB_PORT` | PostgreSQL 端口 | 5432 |
| `DB_NAME` | 数据库名 | mery |
| `DB_USER` | 数据库用户 | mery |
| `REDIS_HOST` | Redis 主机 | localhost |
| `REDIS_PORT` | Redis 端口 | 6379 |
| `BACKUP_DIR` | 备份存储目录 | ./backups |
| `RETENTION_DAYS` | 备份保留天数 | 7 |
| `S3_BUCKET` | S3 存储桶名称 | - |
