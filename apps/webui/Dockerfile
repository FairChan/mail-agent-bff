# Mery WebUI Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 设置 API URL
ENV VITE_API_URL=/api
ENV VITE_BFF_URL=http://localhost:3000

RUN npm run build

# 生产镜像 - 使用 Nginx
FROM nginx:alpine AS production

# 安装 wget 用于健康检查
RUN apk add --no-cache wget

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; \
    gzip_min_length 1000; \
    \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    \
    location /api/ { \
        proxy_pass http://bff:3000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_cache_bypass $http_upgrade; \
    } \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location /health { \
        access_log off; \
        return 200 "OK"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
