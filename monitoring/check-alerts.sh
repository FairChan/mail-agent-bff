#!/bin/bash
# 检查当前告警状态

set -e

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "🔍 Checking Alert Status"
echo "========================"
echo "Prometheus: $PROMETHEUS_URL"
echo ""

# 获取告警列表
echo "📊 Active Alerts:"
curl -s "$PROMETHEUS_URL/api/v1/alerts" | jq -r '
  .data.alerts[] |
  select(.state == "firing" or .state == "pending") |
  "| \(.labels.severity // "unknown") | \(.labels.alertname) | \(.state) | \(.annotations.summary // "N/A")"
' | column -t -s '|' || echo "  No alerts"

echo ""
echo "📊 Alert Summary:"
curl -s "$PROMETHEUS_URL/api/v1/alerts" | jq -r '
  .data.alerts |
  group_by(.labels.severity) |
  .[] |
  "\(.[0].labels.severity): \(length) alerts"
' || echo "  No alerts"
