# Mery BFF Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 复制源码
COPY src/ ./src/
COPY prisma/ ./prisma/

# 生成 Prisma Client
RUN npx prisma generate

# TypeScript 编译
RUN npm run build

# 生产镜像
FROM node:20-alpine AS production

WORKDIR /app

# 安装生产依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 复制 Prisma Schema
COPY prisma/ ./prisma/

# 生成 Prisma Client
RUN npx prisma generate

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 切换用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 启动命令
CMD ["node", "dist/server.js"]
