/**
 * WebUI 本地类型扩展
 *
 * 本文件重导出 shared-types 中定义的共享类型，
 * 并添加 WebUI 专用的本地类型（Zod schema、UI常量、运行时验证等）。
 * 组件应优先从 shared-types 导入共享类型，
 * 仅在需要 Zod schema 或 UI 专用常量时才从本文件导入。
 */

import { z } from "zod";

// Re-export shared types
export type {
  // Enums
  MailQuadrant,
  MailInsightType,
  MailSourceProvider,
  MailRoutingCheckStatus,
  MailQaIntent,
  AiSummaryLocale,
  ViewKey,
  AuthLocale,
  MailPriorityRuleField,

  // Mail classification
  TriageMailItem,
  MailTriageResult,
  MailInsightItem,
  MailInsightsResult,
  MailInboxViewerItem,
  MailInboxViewerResponse,
  MailDetailResponse,

  // Mail source
  MailRoutingCheckResult,
  MailSourceRoutingStatus,
  MailSourceProfile,
  MailRoutingProbeResult,

  // Priority rules
  MailPriorityRule,

  // Calendar
  MailCalendarSyncInput,
  MailCalendarSyncResponse,
  MailCalendarDeleteResponse,

  // Mail Q&A
  MailQaReference,
  MailQaResponse,

  // Auth
  AuthUser,
  SessionEnvelope,
  AuthLoginEnvelope,
  AuthRegisterEnvelope,
  AuthVerifyEnvelope,
  AuthMeEnvelope,

  // Knowledge base
  MailKnowledgeRecord,
  EventCluster,
  PersonProfile,
  MailSubjectIndex,
  MailScoreIndex,
  KnowledgeBaseStats,
  KnowledgeBaseResult,

  // API response envelopes
  ApiResponse,
  MailSourceMutationEnvelope,
  MailSourceSelectEnvelope,
  MailSourceDeleteEnvelope,
  MailSourceVerifyEnvelope,
  MailSourcesEnvelope,
  MailTriageEnvelope,
  MailInsightsEnvelope,
  MailQueryEnvelope,
  CalendarSyncEnvelope,
  CalendarDeleteEnvelope,
  OutlookLaunchEnvelope,
  AutoConnectEnvelope,
  NotificationPreferences,
} from "@mail-agent/shared-types";

export { quadrantMeta, quadrantLabelsByLocale, viewItems, viewLabelsByLocale } from "@mail-agent/shared-types";

// ========== WebUI 专用类型 ==========

export type AuthMode = "login" | "register";

export type SyncedCalendarEvent = {
  eventId: string;
  eventWebLink?: string;
};

export class HttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

// ========== UI 字符串常量 ==========

export type UiCopy = {
  unboundMailbox: string;
  unknownAccount: string;
  checkingSession: string;
  loginOutlook: string;
  authorizing: string;
  refresh: string;
  logout: string;
  openAuthPage: string;
  nav: string;
  currentSource: string;
  syncingMailData: string;
  inboxOverview: string;
  priorityNow: string;
  noSummary: string;
  viewDetail: string;
  noMailToShow: string;
  upcomingSchedule: string;
  noUpcomingItems: string;
  allMail: string;
  searchPlaceholder: string;
  filterAll: string;
  filterUnread: string;
  filterRead: string;
  summaryGenerating: string;
  aiSummary: string;
  originalContent: string;
  openInOutlook: string;
  close: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  importance: string;
};

export const clientTimeZone: string =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC";

export const authLocaleStorageKey = "true-sight-auth-locale";
export const requestLocaleHeaderName = "x-true-sight-locale";

export const authMessages: Record<
  AuthLocale,
  {
    brand: string;
    titleLogin: string;
    titleRegister: string;
    subtitleLogin: string;
    subtitleRegister: string;
    emailLabel: string;
    passwordLabel: string;
    usernameLabel: string;
    confirmPasswordLabel: string;
    rememberLabel: string;
    submitLogin: string;
    submitRegister: string;
    switchToLogin: string;
    switchToRegister: string;
    registerHint: string;
    loginHint: string;
    verifyStepTitle: string;
    verifyStepSubtitle: string;
    verifyStepHint: string;
    verifyCodeLabel: string;
    verifyCodePlaceholder: string;
    submitVerify: string;
    resendCode: string;
    codeSentTo: string;
    backToForm: string;
  }
> = {
  zh: {
    brand: "Mery",
    titleLogin: "登录 Mery",
    titleRegister: "创建你的账号",
    subtitleLogin: "登录后进入邮件工作台。",
    subtitleRegister: "创建账号后会自动登录。",
    emailLabel: "邮箱",
    passwordLabel: "密码",
    usernameLabel: "昵称",
    confirmPasswordLabel: "确认密码",
    rememberLabel: "记住我（30 天）",
    submitLogin: "登录",
    submitRegister: "注册并进入",
    switchToLogin: "已有账号？去登录",
    switchToRegister: "没有账号？去注册",
    registerHint: "建议使用常用邮箱，便于后续找回和多端同步。",
    loginHint: "如果你是首次使用，请先注册账号。",
    verifyStepTitle: "输入邮箱验证码",
    verifyStepSubtitle: "我们已向你的邮箱发送了一封验证邮件。",
    verifyStepHint: "请在下方填入邮件中的 6 位数字验证码。",
    verifyCodeLabel: "验证码",
    verifyCodePlaceholder: "6位数字",
    submitVerify: "验证并登录",
    resendCode: "没收到？重新发送",
    codeSentTo: "已发送至：",
    backToForm: "修改信息",
  },
  en: {
    brand: "Mery",
    titleLogin: "Sign In to Mery",
    titleRegister: "Create Your Account",
    subtitleLogin: "Sign in to access your mail workspace.",
    subtitleRegister: "You will be signed in automatically after registration.",
    emailLabel: "Email",
    passwordLabel: "Password",
    usernameLabel: "Display Name",
    confirmPasswordLabel: "Confirm Password",
    rememberLabel: "Remember me (30 days)",
    submitLogin: "Sign In",
    submitRegister: "Create Account",
    switchToLogin: "Already have an account? Sign in",
    switchToRegister: "New here? Create an account",
    registerHint: "Use your primary email for easier recovery and multi-device access.",
    loginHint: "If this is your first time, create an account first.",
    verifyStepTitle: "Enter Email Verification Code",
    verifyStepSubtitle: "We have sent a verification email to your inbox.",
    verifyStepHint: "Please enter the 6-digit code from your email below.",
    verifyCodeLabel: "Verification Code",
    verifyCodePlaceholder: "6 digits",
    submitVerify: "Verify & Sign In",
    resendCode: "Didn't receive it? Resend",
    codeSentTo: "Sent to:",
    backToForm: "Change info",
  },
  ja: {
    brand: "Mery",
    titleLogin: "Mery にログイン",
    titleRegister: "アカウント作成",
    subtitleLogin: "ログインしてメールワークスペースに入ります。",
    subtitleRegister: "登録後に自動でログインします。",
    emailLabel: "メールアドレス",
    passwordLabel: "パスワード",
    usernameLabel: "表示名",
    confirmPasswordLabel: "パスワード確認",
    rememberLabel: "ログイン状態を保持（30日）",
    submitLogin: "ログイン",
    submitRegister: "アカウント作成",
    switchToLogin: "既存アカウントでログイン",
    switchToRegister: "初めての方は登録",
    registerHint: "主要メールを使うと復旧と複数端末同期が簡単です。",
    loginHint: "初回利用の場合は先にアカウントを作成してください。",
    verifyStepTitle: "メール確認コードを入力",
    verifyStepSubtitle: "受信箱に確認メールを送信しました。",
    verifyStepHint: "以下のフォームにメール内の6桁の確認コードを入力してください。",
    verifyCodeLabel: "確認コード",
    verifyCodePlaceholder: "6桁の数字",
    submitVerify: "確認してログイン",
    resendCode: "届かない？再送信",
    codeSentTo: "送信先：",
    backToForm: "情報を修正",
  },
};

export function getDefaultUiCopy(locale: AuthLocale): UiCopy {
  if (locale === "zh") {
    return {
      unboundMailbox: "未绑定邮箱",
      unknownAccount: "未识别",
      checkingSession: "正在检查会话状态...",
      loginOutlook: "登录 Outlook",
      authorizing: "授权中...",
      refresh: "刷新",
      logout: "退出",
      openAuthPage: "打开授权页",
      nav: "导航",
      currentSource: "当前数据源",
      syncingMailData: "正在同步邮件数据...",
      inboxOverview: "收件箱概览",
      priorityNow: "优先处理",
      noSummary: "暂无摘要",
      viewDetail: "查看",
      noMailToShow: "暂无可展示邮件。",
      upcomingSchedule: "近期日程 / DDL",
      noUpcomingItems: "未来 7 天未识别到明确时间事项。",
      allMail: "所有邮件",
      searchPlaceholder: "搜索邮件主题、发件人...",
      filterAll: "全部",
      filterUnread: "未读",
      filterRead: "已读",
      summaryGenerating: "AI 摘要生成中...",
      aiSummary: "AI 摘要",
      originalContent: "原始内容",
      openInOutlook: "在 Outlook 中打开",
      close: "关闭",
      from: "发件人",
      to: "收件人",
      subject: "主题",
      receivedAt: "收件时间",
      importance: "重要性",
    };
  }
  if (locale === "ja") {
    return {
      unboundMailbox: "未連携",
      unknownAccount: "未確認",
      checkingSession: "セッションを確認中...",
      loginOutlook: "Outlook ログイン",
      authorizing: "認証中...",
      refresh: "更新",
      logout: "ログアウト",
      openAuthPage: "認証ページを開く",
      nav: "ナビゲーション",
      currentSource: "現在のソース",
      syncingMailData: "メールデータを同期中...",
      inboxOverview: "受信箱の概要",
      priorityNow: "優先対応",
      noSummary: "要約なし",
      viewDetail: "表示",
      noMailToShow: "表示できるメールはありません。",
      upcomingSchedule: "近日予定 / DDL",
      noUpcomingItems: "今後7日間の日時付き項目は見つかりませんでした。",
      allMail: "すべてのメール",
      searchPlaceholder: "メールを検索...",
      filterAll: "すべて",
      filterUnread: "未読",
      filterRead: "既読",
      summaryGenerating: "AI 要約生成中...",
      aiSummary: "AI 要約",
      originalContent: "元の内容",
      openInOutlook: "Outlook で開く",
      close: "閉じる",
      from: "送信者",
      to: "受信者",
      subject: "件名",
      receivedAt: "受信時刻",
      importance: "重要度",
    };
  }
  return {
    unboundMailbox: "No mailbox linked",
    unknownAccount: "Unknown",
    checkingSession: "Checking session...",
    loginOutlook: "Sign in Outlook",
    authorizing: "Authorizing...",
    refresh: "Refresh",
    logout: "Sign out",
    openAuthPage: "Open auth page",
    nav: "Navigation",
    currentSource: "Current Source",
    syncingMailData: "Syncing mail data...",
    inboxOverview: "Inbox Overview",
    priorityNow: "Priority Queue",
    noSummary: "No summary",
    viewDetail: "View",
    noMailToShow: "No messages to display.",
    upcomingSchedule: "Upcoming Schedule / DDL",
    noUpcomingItems: "No dated events detected in the next 7 days.",
    allMail: "All Mail",
    searchPlaceholder: "Search by subject, sender...",
    filterAll: "All",
    filterUnread: "Unread",
    filterRead: "Read",
    summaryGenerating: "AI summary generating...",
    aiSummary: "AI Summary",
    originalContent: "Original Content",
    openInOutlook: "Open in Outlook",
    close: "Close",
    from: "From",
    to: "To",
    subject: "Subject",
    receivedAt: "Received",
    importance: "Importance",
  };
}

// ========== Zod Schemas for Runtime Validation ==========

export { z };

const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  locale: z.enum(["zh-CN", "en-US", "ja-JP"]),
});

export const sessionEnvelopeSchema = z.object({
  ok: z.boolean(),
  authenticated: z.boolean(),
  user: authUserSchema.optional(),
});

export const mailQueryEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({ answer: z.string() }),
});

export const authLoginEnvelopeSchema = z.object({ user: authUserSchema });

export const authRegisterEnvelopeSchema = z.object({
  pending: z.boolean(),
  message: z.string(),
  expiresInSeconds: z.number().optional(),
});

export const authMeEnvelopeSchema = z.object({ user: authUserSchema });

export const authPreferencesEnvelopeSchema = z.object({
  ok: z.boolean(),
  user: authUserSchema,
});

const mailSourceRoutingCheckSchema = z.object({
  required: z.boolean(),
  status: z.enum(["skipped", "verified", "failed", "unverifiable"]),
  verified: z.boolean(),
  message: z.string(),
});

const mailSourceRoutingStatusSchema = z.object({
  verifiedAt: z.string(),
  routingVerified: z.boolean(),
  failFast: z.boolean(),
  message: z.string(),
  mailbox: mailSourceRoutingCheckSchema,
  connectedAccount: mailSourceRoutingCheckSchema,
});

const mailSourceProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.literal("outlook"),
  emailHint: z.string(),
  mailboxUserId: z.string().optional(),
  connectedAccountId: z.string().optional(),
  enabled: z.boolean(),
  ready: z.boolean(),
  routingStatus: mailSourceRoutingStatusSchema.optional(),
});

export const mailSourcesEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    sources: z.array(mailSourceProfileSchema),
    activeSourceId: z.string(),
  }),
});

export const mailSourceMutationEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    source: mailSourceProfileSchema,
    activeSourceId: z.string(),
  }),
});

export const mailSourceSelectEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({ activeSourceId: z.string() }),
});

export const mailSourceDeleteEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    id: z.string(),
    deleted: z.boolean(),
    activeSourceId: z.string(),
  }),
});

export const mailSourceVerifyEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    sourceId: z.string(),
    ready: z.boolean(),
    routingStatus: mailSourceRoutingStatusSchema,
  }),
});

const mailQuadrantSchema = z.enum([
  "urgent_important",
  "not_urgent_important",
  "urgent_not_important",
  "not_urgent_not_important",
]);

const triageMailItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  fromName: z.string(),
  fromAddress: z.string(),
  bodyPreview: z.string(),
  webLink: z.string(),
  aiSummary: z.string().optional(),
  isRead: z.boolean().optional(),
  importance: z.string().optional(),
  quadrant: mailQuadrantSchema.optional(),
  receivedDateTime: z.string().optional(),
});

const mailTriageResultSchema = z.object({
  generatedAt: z.string(),
  total: z.number(),
  counts: z.record(mailQuadrantSchema, z.number()),
  quadrants: z.record(mailQuadrantSchema, z.array(triageMailItemSchema)),
  allItems: z.array(triageMailItemSchema),
});

export const mailTriageEnvelopeSchema = z.object({
  ok: z.boolean(),
  sourceId: z.string(),
  result: mailTriageResultSchema,
});

const mailInsightItemSchema = z.object({
  messageId: z.string(),
  subject: z.string(),
  dueAt: z.string(),
  dueDateLabel: z.string(),
  type: z.enum(["ddl", "meeting", "exam", "event"]),
  evidence: z.string().optional(),
  aiSummary: z.string().optional(),
});

const mailInsightsDigestSchema = z.object({
  total: z.number(),
  unread: z.number(),
  urgentImportant: z.number(),
  highImportance: z.number(),
  upcomingCount: z.number(),
  tomorrowDdlCount: z.number(),
});

const mailInsightsResultSchema = z.object({
  generatedAt: z.string().optional(),
  horizonDays: z.number(),
  timeZone: z.string(),
  digest: mailInsightsDigestSchema.optional(),
  tomorrowDdl: z.array(mailInsightItemSchema).optional(),
  upcoming: z.array(mailInsightItemSchema),
});

export const mailInsightsEnvelopeSchema = z.object({
  ok: z.boolean(),
  sourceId: z.string(),
  result: mailInsightsResultSchema,
});

export const outlookLaunchEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    status: z.enum(["active", "initiated", "failed"]),
    hasActiveConnection: z.boolean(),
    needsUserAction: z.boolean(),
    redirectUrl: z.string().nullable(),
    connectedAccountId: z.string().nullable(),
    mailboxUserIdHint: z.string().nullable(),
    sessionInstructions: z.string().nullable(),
    message: z.string().nullable(),
  }),
});

export const autoConnectEnvelopeSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    phase: z.string(),
    message: z.string(),
    activeSourceId: z.string(),
  }),
});

export const calendarSyncEnvelopeSchema = z.object({
  ok: z.boolean(),
  sourceId: z.string(),
  result: z.object({
    eventId: z.string(),
    eventSubject: z.string(),
    eventWebLink: z.string(),
  }),
  deduplicated: z.boolean(),
});

export const calendarDeleteEnvelopeSchema = z.object({
  ok: z.boolean(),
  sourceId: z.string(),
  result: z.object({
    eventId: z.string(),
    deleted: z.boolean(),
    alreadyDeleted: z.boolean(),
  }),
});

export const basicOkEnvelopeSchema = z.object({ ok: z.boolean() });

export const knowledgeBaseStatsSchema = z.object({
  totalMails: z.number(),
  totalEvents: z.number(),
  totalPersons: z.number(),
  processedAt: z.string(),
  dateRange: z.object({ start: z.string(), end: z.string() }),
  quadrantDistribution: z.record(z.string(), z.number()),
});

export const mailKnowledgeRecordSchema = z.object({
  mailId: z.string(),
  rawId: z.string(),
  subject: z.string(),
  personId: z.string(),
  eventId: z.string().nullable(),
  importanceScore: z.number().min(1).max(10),
  urgencyScore: z.number().min(1).max(10),
  quadrant: mailQuadrantSchema,
  summary: z.string(),
  receivedAt: z.string(),
  processedAt: z.string(),
  webLink: z.string().optional(),
});

export const eventClusterSchema = z.object({
  eventId: z.string(),
  name: z.string(),
  summary: z.string(),
  keyInfo: z.array(z.string()),
  relatedMailIds: z.array(z.string()),
  lastUpdated: z.string(),
  tags: z.array(z.string()),
});

export const personProfileSchema = z.object({
  personId: z.string(),
  email: z.string(),
  name: z.string(),
  profile: z.string(),
  role: z.string(),
  importance: z.number().min(1).max(10),
  recentInteractions: z.number(),
  lastUpdated: z.string(),
  avatarUrl: z.string().optional(),
});

export type KnowledgeBaseStatsEnvelope = z.infer<typeof knowledgeBaseStatsSchema>;
export type MailKnowledgeRecordEnvelope = z.infer<typeof mailKnowledgeRecordSchema>;
export type EventClusterEnvelope = z.infer<typeof eventClusterSchema>;
export type PersonProfileEnvelope = z.infer<typeof personProfileSchema>;
