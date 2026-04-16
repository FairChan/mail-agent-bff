#!/bin/bash
# Mery Email 部署脚本
# 用法: ./deploy.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
WEB_DIR="/var/www/mery.email"
FRONTEND_DIR="/root/.openclaw/workspace/apps/webui"
NGINX_CONF="/etc/nginx/conf.d/mery-email.conf"

echo -e "${GREEN}=== Mery Email 部署脚本 ===${NC}\n"

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}错误: 请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# 步骤 1: 构建前端
echo -e "${YELLOW}[1/4] 构建前端...${NC}"
cd "$FRONTEND_DIR"
npx vite build 2>&1 | tail -10
echo -e "${GREEN}✓ 前端构建完成${NC}\n"

# 步骤 2: 复制文件
echo -e "${YELLOW}[2/4] 部署文件...${NC}"
mkdir -p "$WEB_DIR"
cp -r "$FRONTEND_DIR/dist/"* "$WEB_DIR/"
echo -e "${GREEN}✓ 文件部署完成${NC}\n"

# 步骤 3: 检查 Nginx 配置
echo -e "${YELLOW}[3/4] 检查 Nginx 配置...${NC}"
nginx -t 2>/dev/null && echo -e "${GREEN}✓ Nginx 配置正确${NC}\n"

# 步骤 4: 重启服务
echo -e "${YELLOW}[4/4] 重启服务...${NC}"
nginx -s reload
echo -e "${GREEN}✓ 服务已重启${NC}\n"

# 验证
echo -e "${GREEN}=== 部署完成 ===${NC}"
echo ""
echo "网站地址: https://www.mery.email"
echo "API 健康检查: curl https://www.mery.email/api/health"
echo ""
