#!/bin/bash
# 使用 Google Cloud OAuth2 的简易方案
# 
# 步骤 1: 在 Google Cloud Console 注册应用
# https://console.cloud.google.com/apis/credentials
#
# 步骤 2: 启用 Gmail API
# 
# 步骤 3: 下载 OAuth2 客户端凭据 (credentials.json)
#
# 步骤 4: 运行此脚本获取 token
#
# Usage: ./get-google-token.sh

echo "=== Gmail OAuth2 Setup ==="
echo ""
echo "1. 打开 https://console.cloud.google.com/apis/credentials"
echo "2. 创建 OAuth2 客户端 ID"
echo "3. 下载 json 文件到 ~/.config/himalaya/credentials.json"
echo "4. 运行脚本获取 token"
echo ""

# 检查凭据文件
CRED_FILE="$HOME/.config/himalaya/credentials.json"
TOKEN_FILE="$HOME/.config/himalaya/token.json"

if [ ! -f "$CRED_FILE" ]; then
    echo "请先下载 OAuth2 凭据文件到: $CRED_FILE"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "需要 Python3"
    exit 1
fi

# 检查 google-auth 和 google-auth-oauthlib
pip3 install --user google-auth google-auth-oauthlib 2>/dev/null

python3 << 'EOF'
import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle

creds_file = os.path.expanduser("~/.config/himalaya/credentials.json")
token_file = os.path.expanduser("~/.config/himalaya/token.json")

SCOPES = ['https://mail.google.com/']

flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
creds = flow.run_local_server(port=8080)

# 保存 token
with open(token_file, 'w') as f:
    f.write(creds.to_json())

print("✓ Token 已保存!")
print(f"位置: {token_file}")
EOF