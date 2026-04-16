#!/bin/bash
# 邮件知识库定时更新脚本

LOGFILE="/tmp/mail-kb-update.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$DATE] Starting mail knowledge base update..." >> $LOGFILE

# 获取最近一天的邮件
BFF_URL="http://127.0.0.1:8787"
GATEWAY_URL="http://127.0.0.1:18789"
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

# 调用 BFF API 触发总结
RESPONSE=$(curl -s -X POST "$BFF_URL/api/mail/knowledge-base/summarize" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"default_outlook"}')

echo "[$DATE] Response: $RESPONSE" >> $LOGFILE

# 记录任务 ID
JOB_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null)
if [ -n "$JOB_ID" ]; then
  echo "[$DATE] Started job: $JOB_ID" >> $LOGFILE
fi

echo "[$DATE] Mail KB update triggered." >> $LOGFILE
