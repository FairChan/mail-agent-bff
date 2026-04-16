#!/bin/bash
# PostgreSQL 数据库备份脚本

set -e

# 配置
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="postgres_${DATE}.sql"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# 环境变量
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mery}"
DB_USER="${DB_USER:-mery}"
DB_PASSWORD="${DB_PASSWORD:-}"

# S3 配置（可选）
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-mery/backups}"

echo "🔄 PostgreSQL Backup"
echo "===================="
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo "Backup file: $BACKUP_FILE"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 设置环境变量
export PGHOST="$DB_HOST"
export PGPORT="$DB_PORT"
export PGDATABASE="$DB_NAME"
export PGUSER="$DB_USER"
export PGPASSWORD="$DB_PASSWORD"

# 执行备份
echo "📦 Running pg_dump..."
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="${BACKUP_DIR}/${BACKUP_FILE}.dump"

# 压缩备份文件
echo "📦 Compressing..."
gzip "${BACKUP_DIR}/${BACKUP_FILE}.dump"

# 记录备份信息
echo "$DATE|$BACKUP_FILE.gz|$(du -h "${BACKUP_DIR}/${BACKUP_FILE}.gz" | cut -f1)" >> "${BACKUP_DIR}/backup.log"

# 上传到 S3（如果配置了）
if [ -n "$S3_BUCKET" ]; then
  echo "☁️ Uploading to S3..."
  aws s3 cp \
    "${BACKUP_DIR}/${BACKUP_FILE}.gz" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/postgres/${BACKUP_FILE}.gz" \
    --storage-class STANDARD_IA
  
  echo "✅ Uploaded to s3://${S3_BUCKET}/${S3_PREFIX}/postgres/"
fi

# 清理过期备份
echo "🧹 Cleaning old backups (retention: ${RETENTION_DAYS} days)..."
find "$BACKUP_DIR" -name "postgres_*.gz" -mtime +${RETENTION_DAYS} -delete

# 显示备份统计
echo ""
echo "📊 Backup Statistics"
echo "--------------------"
echo "Latest backup: $BACKUP_FILE.gz"
echo "Total backups: $(find "$BACKUP_DIR" -name 'postgres_*.gz' | wc -l)"
echo "Disk usage: $(du -sh "$BACKUP_DIR" | cut -f1)"

echo ""
echo "✅ Backup complete!"
