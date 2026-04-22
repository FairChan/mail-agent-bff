export function formatOauthConnectionError(
  provider: "outlook" | "gmail",
  error: unknown
): string {
  const message = error instanceof Error ? error.message : provider === "outlook" ? "连接 Outlook 失败" : "连接 Gmail 失败";

  if (message.includes("401") || message.includes("Unauthorized")) {
    return "会话已过期，请重新登录后重试。";
  }

  if (provider === "outlook") {
    if (message.includes("MICROSOFT_OAUTH_NOT_CONFIGURED") || message.includes("MICROSOFT_CLIENT_ID")) {
      return "Microsoft OAuth 尚未配置，请先在 BFF 环境变量中填写客户端信息。";
    }
    if (message.includes("MICROSOFT_OAUTH_START_FAILED")) {
      return "无法启动 Microsoft 登录，请稍后重试。";
    }
    return `授权失败: ${message}`;
  }

  if (message.includes("GOOGLE_OAUTH_NOT_CONFIGURED") || message.includes("GOOGLE_CLIENT_ID")) {
    return "Google OAuth 尚未配置，请先在 BFF 环境变量中填写客户端信息。";
  }
  if (message.includes("GOOGLE_OAUTH_STORE_UNAVAILABLE")) {
    return "Gmail 令牌存储暂时不可用，请检查数据库、回退存储和 APP_ENCRYPTION_KEY 配置。";
  }
  if (message.includes("GOOGLE_OAUTH_STORAGE_NOT_CONFIGURED")) {
    return "后端缺少 APP_ENCRYPTION_KEY，当前无法安全保存 Gmail 令牌。";
  }

  return `授权失败: ${message}`;
}

export function formatImapConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "IMAP 接入失败";

  if (message.includes("401") || message.includes("Unauthorized")) {
    return "会话已过期，请重新登录后重试。";
  }
  if (message.includes("IMAP_CONNECTION_FAILED") || message.includes("IMAP connection verification failed")) {
    return "IMAP 验证失败，请确认已开启 IMAP，并使用授权码或应用专用密码。";
  }
  if (message.includes("IMAP_TLS_REQUIRED") || message.includes("TLS is required for IMAP connections")) {
    return "当前版本强制使用 TLS/SSL 加密连接，请使用 993 等加密 IMAP 端口。";
  }
  if (message.includes("IMAP_HOST_REQUIRED") || message.includes("IMAP host is required")) {
    return "该邮箱类型需要填写 IMAP Host。";
  }

  return message;
}
