#!/bin/bash
# 综合备份脚本 - 备份所有数据

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_DIR}/backup-${DATE}.log"

echo "🔄 Full System Backup - $(date)"
echo "================================"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 记录开始时间
START_TIME=$(date +%s)

# PostgreSQL 备份
echo "" | tee -a "$LOG_FILE"
echo "=== PostgreSQL ===" | tee -a "$LOG_FILE"
bash "$(dirname "$0")/postgres-backup.sh" 2>&1 | tee -a "$LOG_FILE"

# Redis 备份
echo "" | tee -a "$LOG_FILE"
echo "=== Redis ===" | tee -a "$LOG_FILE"
bash "$(dirname "$0")/redis-backup.sh" 2>&1 | tee -a "$LOG_FILE"

# 计算总耗时
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "" | tee -a "$LOG_FILE"
echo "=== Summary ===" | tee -a "$LOG_FILE"
echo "Completed at: $(date)" | tee -a "$LOG_FILE"
echo "Duration: ${DURATION} seconds" | tee -a "$LOG_FILE"
echo "Backup location: $BACKUP_DIR" | tee -a "$LOG_FILE"

# 上传到远程存储（如果配置了）
if [ -n "$REMOTE_BACKUP_HOST" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "=== Uploading to remote ===" | tee -a "$LOG_FILE"
  rsync -avz --delete \
    -e "ssh -i $REMOTE_SSH_KEY" \
    "$BACKUP_DIR/" \
    "$REMOTE_BACKUP_HOST:$REMOTE_BACKUP_PATH/" 2>&1 | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "✅ Full backup complete!"
