// i18n.ts - 国际化错误消息
export type SupportedLocale = "zh-CN" | "en-US" | "ja-JP";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["zh-CN", "en-US", "ja-JP"];

export function resolveLocale(locale: string | undefined): SupportedLocale {
  if (!locale) return "zh-CN";
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.startsWith("ja")) return "ja-JP";
  return "zh-CN";
}

type MessageMap = Record<SupportedLocale, string>;

const INTERNAL_ERRORS: MessageMap = {
  "zh-CN": "服务器内部错误，请稍后重试",
  "en-US": "Internal server error, please try again later",
  "ja-JP": "サーバー内部エラー。後でもう一度お試しください",
};

const RATE_LIMIT_ERRORS: MessageMap = {
  "zh-CN": "请求过于频繁，请稍后重试",
  "en-US": "Too many requests, please try again later",
  "ja-JP": "リクエストが多すぎます。しばらくしてからもう一度お試しください",
};

const AUTH_ERRORS: Record<string, MessageMap> = {
  INVALID_CREDENTIALS: {
    "zh-CN": "邮箱或密码错误",
    "en-US": "Invalid email or password",
    "ja-JP": "メールアドレスまたはパスワードが正しくありません",
  },
  EMAIL_ALREADY_EXISTS: {
    "zh-CN": "该邮箱已被注册",
    "en-US": "This email is already registered",
    "ja-JP": "このメールアドレスは既に登録されています",
  },
  EMAIL_NOT_VERIFIED: {
    "zh-CN": "请先验证邮箱",
    "en-US": "Please verify your email first",
    "ja-JP": "まずメールアドレスを確認してください",
  },
  ACCOUNT_LOCKED: {
    "zh-CN": "账号已被锁定，请稍后再试",
    "en-US": "Account locked, please try again later",
    "ja-JP": "アカウントがロックされています。しばらくしてからもう一度お試しください",
  },
  TOO_MANY_LOGIN_ATTEMPTS: {
    "zh-CN": "登录尝试次数过多，请稍后重试",
    "en-US": "Too many login attempts, please try again later",
    "ja-JP": "ログイン試行回数が多すぎます。しばらくしてからもう一度お試しください",
  },
  SESSION_STATUS_RATE_LIMITED: {
    "zh-CN": "会话状态查询过于频繁，请稍后重试",
    "en-US": "Too many session status requests, please try again later",
    "ja-JP": "セッション状態のリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  VERIFICATION_REQUEST_RATE_LIMITED: {
    "zh-CN": "验证请求过于频繁，请稍后重试",
    "en-US": "Too many verification requests. Please wait a minute",
    "ja-JP": "確認リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  VERIFICATION_ATTEMPT_RATE_LIMITED: {
    "zh-CN": "验证尝试次数过多，请重新注册",
    "en-US": "Too many incorrect attempts. Please register again",
    "ja-JP": "誤った試行回数が多すぎます。再度登録してください",
  },
};

const MAIL_ERRORS: Record<string, MessageMap> = {
  OUTLOOK_DELETE_EVENT_SOURCE_CONTEXT_MISMATCH: {
    "zh-CN": "日历事件同步冲突，请重试",
    "en-US": "Calendar event sync conflict, please retry",
    "ja-JP": "カレンダーイベントの同期衝突。再試行してください",
  },
  MAIL_SOURCE_NOT_FOUND: {
    "zh-CN": "邮件数据源未找到",
    "en-US": "Mail source not found",
    "ja-JP": "メールソースが見つかりません",
  },
  GATEWAY_TIMEOUT: {
    "zh-CN": "AI 服务响应超时，请稍后重试",
    "en-US": "AI service timeout, please try again later",
    "ja-JP": "AIサービスのタイムアウト。後でもう一度お試しください",
  },
};

// 各模块的 rate limit 错误消息
const MAIL_SOURCE_RATE_LIMIT_ERRORS: Record<string, MessageMap> = {
  MAIL_SOURCE_READ_RATE_LIMITED: {
    "zh-CN": "邮件数据源读取请求过于频繁，请稍后重试",
    "en-US": "Too many mail source requests, please try again later",
    "ja-JP": "メールソース読み取りリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  MAIL_SOURCE_WRITE_RATE_LIMITED: {
    "zh-CN": "邮件数据源写入请求过于频繁，请稍后重试",
    "en-US": "Too many mail source write requests, please try again later",
    "ja-JP": "メールソース書き込みリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  OUTLOOK_CONNECTION_RATE_LIMITED: {
    "zh-CN": "Outlook 连接请求过于频繁，请稍后重试",
    "en-US": "Too many Outlook connection requests, please try again later",
    "ja-JP": "Outlook接続リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  OUTLOOK_REINITIATE_RATE_LIMITED: {
    "zh-CN": "Outlook 重新初始化请求过于频繁，请稍后重试",
    "en-US": "Too many Outlook reinitiate requests, please try again later",
    "ja-JP": "Outlook再初期化リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  OUTLOOK_LAUNCH_AUTH_RATE_LIMITED: {
    "zh-CN": "Outlook 认证启动请求过于频繁，请稍后重试",
    "en-US": "Too many Outlook launch-auth requests, please try again later",
    "ja-JP": "Outlook認証起動リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  NOTIFICATION_PREFERENCE_UPDATE_RATE_LIMITED: {
    "zh-CN": "通知偏好更新请求过于频繁，请稍后重试",
    "en-US": "Too many notification preference update requests, please try again later",
    "ja-JP": "通知設定更新リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  PRIORITY_RULE_WRITE_RATE_LIMITED: {
    "zh-CN": "优先级规则写入请求过于频繁，请稍后重试",
    "en-US": "Too many priority rule write requests, please try again later",
    "ja-JP": "優先ルール書き込みリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  AUTO_CONNECT_RATE_LIMITED: {
    "zh-CN": "自动连接请求过于频繁，请稍后重试",
    "en-US": "Too many auto-connect requests, please try again later",
    "ja-JP": "自動接続リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  PRIORITY_RULE_RATE_LIMITED: {
    "zh-CN": "优先级规则请求过于频繁，请稍后重试",
    "en-US": "Too many priority rule requests, please try again later",
    "ja-JP": "優先ルールリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  NOTIFICATION_PREFERENCE_RATE_LIMITED: {
    "zh-CN": "通知偏好设置请求过于频繁，请稍后重试",
    "en-US": "Too many notification preference requests, please try again later",
    "ja-JP": "通知設定リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  NOTIFICATION_POLL_RATE_LIMITED: {
    "zh-CN": "通知轮询请求过于频繁，请稍后重试",
    "en-US": "Too many notification poll requests, please try again later",
    "ja-JP": "通知ポーリングリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  NOTIFICATION_STREAM_RATE_LIMITED: {
    "zh-CN": "通知流请求过于频繁，请稍后重试",
    "en-US": "Too many notification stream requests, please try again later",
    "ja-JP": "通知ストリームリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  MAIL_TRIAGE_RATE_LIMITED: {
    "zh-CN": "邮件分类请求过于频繁，请稍后重试",
    "en-US": "Too many mail triage requests, please try again later",
    "ja-JP": "メールトリアージリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  MAIL_INSIGHTS_RATE_LIMITED: {
    "zh-CN": "邮件洞察请求过于频繁，请稍后重试",
    "en-US": "Too many mail insights requests, please try again later",
    "ja-JP": "メールインサイトリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  INBOX_VIEWER_RATE_LIMITED: {
    "zh-CN": "收件箱查看请求过于频繁，请稍后重试",
    "en-US": "Too many inbox viewer requests, please try again later",
    "ja-JP": "受信トレイ表示リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  MAIL_QUERY_RATE_LIMITED: {
    "zh-CN": "邮件查询请求过于频繁，请稍后重试",
    "en-US": "Too many mail query requests, please try again later",
    "ja-JP": "メールクエリリクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  MAIL_DETAIL_RATE_LIMITED: {
    "zh-CN": "邮件详情请求过于频繁，请稍后重试",
    "en-US": "Too many mail detail requests, please try again later",
    "ja-JP": "メール詳細リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  BATCH_SYNC_RATE_LIMITED: {
    "zh-CN": "批量同步请求过于频繁，请稍后重试",
    "en-US": "Too many batch sync requests, please try again later",
    "ja-JP": "バッチ同期リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
  BATCH_DELETE_RATE_LIMITED: {
    "zh-CN": "批量删除请求过于频繁，请稍后重试",
    "en-US": "Too many batch delete requests, please try again later",
    "ja-JP": "バッチ削除リクエストが多すぎます。しばらくしてからもう一度お試しください",
  },
};

export function getLocalizedErrorMessage(errorCode: string, locale: SupportedLocale): string {
  if (AUTH_ERRORS[errorCode]) {
    return AUTH_ERRORS[errorCode][locale];
  }
  if (MAIL_ERRORS[errorCode]) {
    return MAIL_ERRORS[errorCode][locale];
  }
  if (MAIL_SOURCE_RATE_LIMIT_ERRORS[errorCode]) {
    return MAIL_SOURCE_RATE_LIMIT_ERRORS[errorCode][locale];
  }
  if (errorCode === "RATE_LIMIT") {
    return RATE_LIMIT_ERRORS[locale];
  }
  if (errorCode === "INTERNAL_ERROR" || errorCode === "UNKNOWN") {
    return INTERNAL_ERRORS[locale];
  }
  return RATE_LIMIT_ERRORS[locale];
}

export function getLocalizedErrorMessageForRequest(
  errorCode: string,
  requestLocaleHeader: string | undefined
): string {
  const locale = resolveLocale(requestLocaleHeader);
  return getLocalizedErrorMessage(errorCode, locale);
}
