#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
AUTH_EMAIL="${AUTH_EMAIL:-test@example.com}"
AUTH_PASSWORD="${AUTH_PASSWORD:-TestPassword123}"

echo "🚀 Starting k6 Load Tests"
echo "📍 Target: $BASE_URL"

# 检查 k6 是否安装
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 not found. Installing..."
    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install k6
    # Linux
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo gpg -k
        sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
        echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
        sudo apt-get update
        sudo apt-get install k6
    fi
fi

# 运行基础负载测试
echo ""
echo "📊 Running Basic Load Test..."
k6 run \
  --env BASE_URL="$BASE_URL" \
  --env AUTH_EMAIL="$AUTH_EMAIL" \
  --env AUTH_PASSWORD="$AUTH_PASSWORD" \
  --out json=results-basic.json \
  bff-load.test.ts

# 运行峰值测试
echo ""
echo "📊 Running Peak Load Test..."
k6 run \
  --env BASE_URL="$BASE_URL" \
  --out json=results-peak.json \
  peak-load.test.ts

# 生成汇总报告
echo ""
echo "📋 Test Results Summary"
echo "========================"
echo "Basic Load: results-basic.json"
echo "Peak Load: results-peak.json"

# 检查结果
HIGH_ERRORS=$(grep -c '"type":"Point","metric":"errors"' results-basic.json || echo "0")
echo "High Error Rate: $HIGH_ERRORS"
