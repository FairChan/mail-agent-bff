#!/bin/bash
# PostgreSQL 数据库恢复脚本

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file> [--dry-run]"
  echo ""
  echo "Available backups:"
  ls -la ./*.dump.gz 2>/dev/null || echo "  No local backups found"
  exit 1
fi

BACKUP_FILE="$1"
DRY_RUN="${2:-}"

# 配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mery}"
DB_USER="${DB_USER:-mery}"

echo "⚠️  Database Restore"
echo "===================="
echo "Backup file: $BACKUP_FILE"
echo "Target: $DB_NAME@$DB_HOST:$DB_PORT"

# 解压备份文件
echo "📦 Extracting backup..."
gunzip -k "$BACKUP_FILE"

# 获取解压后的文件名
DUMP_FILE="${BACKUP_FILE%.gz}"

if [ -n "$DRY_RUN" ]; then
  echo "🔍 DRY RUN - Validating backup without restoring..."
  pg_restore --dbname postgres:// "$DUMP_FILE" --verbose 2>&1 | head -20
else
  # 确认操作
  read -p "This will overwrite the current database. Continue? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
  fi
  
  # 终止现有连接
  echo "🔌 Terminating existing connections..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"
  
  # 删除并重建数据库
  echo "🗑️  Dropping existing database..."
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
  
  echo "📦 Creating database..."
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
  
  # 恢复数据
  echo "📥 Restoring data..."
  pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    "$DUMP_FILE"
fi

# 清理临时文件
rm -f "$DUMP_FILE"

echo ""
echo "✅ Restore complete!"
