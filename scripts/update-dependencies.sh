#!/bin/bash
# 依赖更新脚本

set -e

echo "🔄 Updating Dependencies"
echo "========================="

# BFF 更新
echo ""
echo "📦 Updating BFF dependencies..."
cd apps/bff
npm update
npm audit fix --force

# WebUI 更新
echo ""
echo "📦 Updating WebUI dependencies..."
cd ../webui
npm update
npm audit fix --force

# 返回根目录
cd ../..

echo ""
echo "✅ Dependency update complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Review changes in package*.json"
echo "  2. Run tests: npm test"
echo "  3. Build: npm run build"
echo "  4. Create commit and push"
