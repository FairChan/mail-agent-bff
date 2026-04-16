#!/bin/bash
# 依赖安全检查脚本

set -e

echo "🔍 Dependency Security Check"
echo "============================"

# 检查 npm 版本
echo "npm version: $(npm --version)"

# 检查 Node.js 版本
echo "Node.js version: $(node --version)"
echo ""

# BFF 依赖检查
echo "📦 Checking BFF dependencies..."
cd apps/bff
if [ -f package.json ]; then
  echo "--- BFF Audit ---"
  npm audit --audit-level=moderate 2>&1 || true
  echo ""
  echo "--- BFF Outdated ---"
  npm outdated 2>&1 || true
fi
cd ../..

# WebUI 依赖检查
echo ""
echo "📦 Checking WebUI dependencies..."
cd apps/webui
if [ -f package.json ]; then
  echo "--- WebUI Audit ---"
  npm audit --audit-level=moderate 2>&1 || true
  echo ""
  echo "--- WebUI Outdated ---"
  npm outdated 2>&1 || true
fi
cd ../..

echo ""
echo "✅ Dependency check complete!"
