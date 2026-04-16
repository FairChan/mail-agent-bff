#!/bin/bash
# Redis 数据库备份脚本

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="redis_${DATE}.rdb"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Redis 配置
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

echo "🔄 Redis Backup"
echo "==============="
echo "Redis: $REDIS_HOST:$REDIS_PORT"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 使用 redis-cli 执行 BGSAVE 并等待完成
echo "📦 Running BGSAVE..."
if [ -n "$REDIS_PASSWORD" ]; then
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGSAVE
else
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE
fi

# 等待后台保存完成
while [ "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} LASTSAVE)" == "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} LASTSAVE)" ]; do
  sleep 1
done

echo "✅ BGSAVE completed"

# 复制 RDB 文件
REDIS_DUMP_FILE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} CONFIG GET dir 2>/dev/null | tail -1)/dump.rdb

if [ -f "$REDIS_DUMP_FILE" ]; then
  cp "$REDIS_DUMP_FILE" "${BACKUP_DIR}/${BACKUP_FILE}"
  gzip "${BACKUP_DIR}/${BACKUP_FILE}"
  echo "✅ Backed up: ${BACKUP_DIR}/${BACKUP_FILE}.gz"
else
  echo "❌ Redis dump file not found at $REDIS_DUMP_FILE"
  exit 1
fi

# 记录备份信息
echo "$DATE|${BACKUP_FILE}.gz|$(du -h "${BACKUP_DIR}/${BACKUP_FILE}.gz" | cut -f1)" >> "${BACKUP_DIR}/backup.log"

# 清理过期备份
find "$BACKUP_DIR" -name "redis_*.gz" -mtime +${RETENTION_DAYS} -delete

echo ""
echo "✅ Backup complete!"
