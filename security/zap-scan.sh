#!/bin/bash
# OWASP ZAP 安全扫描脚本

set -e

TARGET_URL="${TARGET_URL:-http://localhost:3000}"
REPORT_FILE="zap-report-$(date +%Y%m%d-%H%M%S).json"
ZAP_IMAGE="owasp/zap2docker-stable:latest"

echo "🔒 Starting OWASP ZAP Security Scan"
echo "📍 Target: $TARGET_URL"
echo "📄 Report: $REPORT_FILE"

# 确保 ZAP Docker 镜像已拉取
docker pull "$ZAP_IMAGE" || true

# 运行 ZAP Baseline Scan
docker run --rm \
  -v "$(pwd):/zap/wrk:rw" \
  -w /zap/wrk \
  -e TARGET_URL="$TARGET_URL" \
  "$ZAP_IMAGE" \
  zap-baseline.py \
    -t "$TARGET_URL" \
    -J "$REPORT_FILE" \
    -r scan-report.html \
    -I \
    -d \
  || true

echo ""
echo "✅ Scan complete. Reports:"
echo "  - JSON: $REPORT_FILE"
echo "  - HTML: scan-report.html"

# 如果有高危告警，退出码非零
if grep -q '"risk":"High"' "$REPORT_FILE" 2>/dev/null; then
  echo "⚠️  High risk vulnerabilities found!"
  grep -A 5 '"risk":"High"' "$REPORT_FILE" || true
  exit 1
fi
