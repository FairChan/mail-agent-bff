#!/bin/bash
# Mery Docker Compose 启动脚本

set -e

cd "$(dirname "$0")"

echo "🚀 Mery 部署脚本"
echo "================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件设置安全的密码和密钥"
fi

# 拉取最新镜像
echo "📦 拉取最新镜像..."
docker compose pull || true

# 构建本地镜像
echo "🔨 构建本地镜像..."
docker compose build

# 启动服务
echo "▶️  启动服务..."
docker compose up -d

# 等待服务健康
echo "⏳ 等待服务启动..."
sleep 10

# 检查状态
echo ""
echo "📊 服务状态:"
docker compose ps

# 显示访问地址
echo ""
echo "✅ 部署完成!"
echo ""
echo "访问地址:"
echo "  - WebUI:  http://localhost:8080"
echo "  - BFF API: http://localhost:3000"
echo "  - API 文档: http://localhost:3000/api-docs/"
echo "  - 健康检查: http://localhost:3000/api/health"
echo ""
echo "查看日志: docker compose logs -f"
echo "停止服务: docker compose down"
