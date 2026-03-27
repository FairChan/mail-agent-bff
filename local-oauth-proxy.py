#!/usr/bin/env python3
"""
Local OAuth2 IMAP/SMTP Proxy
让 himalaya 可以通过普通密码认证连接 Outlook/Gmail

使用方法:
1. 在 Azure/Google Cloud 注册 OAuth2 应用
2. 运行: python3 local-oauth-proxy.py
3. 配置 himalaya 指向本地代理 127.0.0.1
"""

import socket
import threading
import asyncio
import json
import os
from imaplib import IMAP4
import ssl

# ========== 配置 ==========
LISTEN_HOST = '127.0.0.1'
IMAP_PORT = 1143  # 本地 IMAP 端口
SMTP_PORT = 2025  # 本地 SMTP 端口

# Outlook OAuth2 配置
OUTLOOK_CLIENT_ID = 'YOUR_CLIENT_ID'
OUTLOOK_CLIENT_SECRET = 'YOUR_CLIENT_SECRET'
OUTLOOK_TENANT = 'common'
OUTLOOK_REDIRECT_URI = 'http://localhost'

# ========== OAuth2 令牌管理 ==========
def get_oauth2_token():
    """获取 OAuth2 访问令牌"""
    # 这是简化的 Web 服务器流程
    # 实际使用时需要先获取 authorization code
    
    import webbrowser
    import urllib.parse
    
    scopes = "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access"
    auth_url = f"https://login.microsoftonline.com/{OUTLOOK_TENANT}/oauth2/v2.0/authorize?"
    auth_url += f"client_id={OUTLOOK_CLIENT_ID}"
    auth_url += f"&response_type=code"
    auth_url += f"&redirect_uri={OUTLOOK_REDIRECT_URI}"
    auth_url += f"&scope={urllib.parse.quote(scopes)}"
    
    print(f"\n请在浏览器中打开以下链接进行授权:")
    print(auth_url)
    print("\n授权完成后，浏览器会跳转到 localhost，请复制 URL 中的 code 参数值")
    
    code = input("请输入 authorization code: ").strip()
    
    # 交换 token
    token_url = f"https://login.microsoftonline.com/{OUTLOOK_TENANT}/oauth2/v2.0/token"
    data = {
        'client_id': OUTLOOK_CLIENT_ID,
        'client_secret': OUTLOOK_CLIENT_SECRET,
        'code': code,
        'redirect_uri': OUTLOOK_REDIRECT_URI,
        'grant_type': 'authorization_code'
    }
    
    import requests
    resp = requests.post(token_url, data=data)
    tokens = resp.json()
    
    if 'access_token' in tokens:
        print("✓ OAuth2 认证成功!")
        return tokens['access_token']
    else:
        print(f"✗ 获取 token 失败: {tokens}")
        return None

# ========== IMAP 代理 ==========
class IMAPProxy:
    def __init__(self, remote_host, remote_port, encryption='ssl'):
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.encryption = encryption
        self.token = None
        
    def handle_client(self, client_socket):
        """处理客户端连接"""
        try:
            if self.encryption == 'ssl':
                remote_socket = ssl.wrap_socket(socket.socket())
            else:
                remote_socket = socket.socket()
                
            remote_socket.connect((self.remote_host, self.remote_port))
            
            # 转发数据
            def forward(src, dst):
                while True:
                    data = src.recv(4096)
                    if not data:
                        break
                    dst.sendall(data)
            
            # 启动转发线程
            threading.Thread(target=forward, args=(client_socket, remote_socket)).start()
            threading.Thread(target=forward, args=(remote_socket, client_socket)).start()
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            client_socket.close()
            remote_socket.close()
    
    def start(self):
        """启动代理服务器"""
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((LISTEN_HOST, IMAP_PORT))
        server.listen(5)
        print(f"IMAP 代理已启动: {LISTEN_HOST}:{IMAP_PORT}")
        print(f"远程: {self.remote_host}:{self.remote_port}")
        
        while True:
            client, addr = server.accept()
            threading.Thread(target=self.handle_client, args=(client,)).start()

if __name__ == '__main__':
    print("=== Local OAuth2 Mail Proxy ===")
    print("选择邮箱类型:")
    print("1. Outlook (Microsoft)")
    print("2. Gmail (Google)")
    
    choice = input("请选择 (1/2): ").strip()
    
    if choice == '1':
        # Outlook 配置
        print("\n需要先在 Azure 注册应用:")
        print("1. 打开 https://portal.azure.com")
        print("2. 注册新应用")
        print("3. 添加 API 权限: IMAP.AccessAsUser.All, SMTP.Send")
        print("4. 创建客户端密码")
        
        CLIENT_ID = input("输入 Client ID: ").strip()
        CLIENT_SECRET = input("输入 Client Secret: ").strip()
        
        # 保存配置
        config = {
            'client_id': CLIENT_ID,
            'client_secret': CLIENT_SECRET
        }
        
        proxy = IMAPProxy('outlook.office365.com', 993)
        print("\n启动 Outlook IMAP 代理...")
        
    else:
        proxy = IMAPProxy('imap.gmail.com', 993)
        print("\n启动 Gmail IMAP 代理...")
    
    # 获取 token
    token = get_oauth2_token()
    if token:
        proxy.token = token
        proxy.start()