/**
 * Mail Agent 工作台 - 共享类型定义
 * 这些类型在 BFF 和 WebUI 之间共享，确保类型一致性
 */

// ========== 枚举和常量 ==========

export type MailQuadrant =
  | "urgent_important"
  | "not_urgent_important"
  | "urgent_not_important"
  | "not_urgent_not_important";

export type MailInsightType = "ddl" | "meeting" | "exam" | "event";

export type MailSourceProvider = "outlook";

export type MailRoutingCheckStatus = "skipped" | "verified" | "failed" | "unverifiable";

export type MailQaIntent =
  | "tomorrow_ddl"
  | "upcoming"
  | "unread_count"
  | "urgent_important"
  | "unknown";

export type AiSummaryLocale = "zh-CN" | "en-US" | "ja-JP";

export type ViewKey = "inbox" | "allmail" | "stats" | "calendar" | "knowledgebase" | "settings";

export type AuthLocale = "zh" | "en" | "ja";

// ========== 邮件分类相关 ==========

export type TriageMailItem = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  webLink: string;
  aiSummary?: string;
  isRead?: boolean;
  importance?: string;
  quadrant?: MailQuadrant;
  receivedDateTime?: string;
};

export type MailTriageResult = {
  generatedAt: string;
  total: number;
  counts: Record<MailQuadrant, number>;
  quadrants: Record<MailQuadrant, TriageMailItem[]>;
  allItems: TriageMailItem[];
};

export type MailInsightItem = {
  messageId: string;
  subject: string;
  dueAt: string;
  dueDateLabel: string;
  type: MailInsightType;
  evidence?: string;
  aiSummary?: string;
  fromName?: string;
  fromAddress?: string;
  receivedDateTime?: string;
  quadrant?: MailQuadrant;
  confidence?: number;
  reasons?: string[];
};

export type MailInsightsResult = {
  generatedAt?: string;
  horizonDays: number;
  timeZone: string;
  digest?: {
    total: number;
    unread: number;
    urgentImportant: number;
    highImportance: number;
    upcomingCount: number;
    tomorrowDdlCount: number;
  };
  tomorrowDdl?: MailInsightItem[];
  upcoming: MailInsightItem[];
  signalsWithoutDate?: Array<{
    messageId: string;
    subject: string;
    fromName: string;
    quadrant: MailQuadrant;
    type: MailInsightType;
    evidence: string;
  }>;
};

export type MailInboxViewerItem = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
  webLink: string;
};

export type MailInboxViewerResponse = {
  generatedAt: string;
  total: number;
  items: MailInboxViewerItem[];
};

export type MailDetailResponse = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedDateTime: string;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string;
  bodyContentType: string;
  bodyContent: string;
  bodyPreview: string;
};

// ========== 邮件源相关 ==========

export type MailRoutingCheckResult = {
  required: boolean;
  status: MailRoutingCheckStatus;
  verified: boolean;
  message: string;
};

export type MailSourceRoutingStatus = {
  verifiedAt: string;
  routingVerified: boolean;
  failFast: boolean;
  message: string;
  mailbox: MailRoutingCheckResult;
  connectedAccount: MailRoutingCheckResult;
};

export type MailSourceProfile = {
  id: string;
  name: string;
  provider: MailSourceProvider;
  emailHint: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
  enabled: boolean;
  ready: boolean;
  routingStatus?: MailSourceRoutingStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type MailRoutingProbeResult = {
  ok: boolean;
  error?: string;
};

// ========== 优先级规则相关 ==========

export type MailPriorityRuleField = "from" | "subject" | "body" | "any";

export type MailPriorityRule = {
  id: string;
  name: string;
  pattern: string;
  field: MailPriorityRuleField;
  quadrant: MailQuadrant;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

// ========== 日历相关 ==========

export type MailCalendarSyncInput = {
  messageId: string;
  subject: string;
  type: MailInsightType;
  dueAt: string;
  dueDateLabel?: string;
  evidence?: string;
  timeZone?: string;
};

export type MailCalendarSyncResponse = {
  eventId: string;
  eventSubject: string;
  eventWebLink: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
};

export type MailCalendarDeleteResponse = {
  eventId: string;
  deleted: boolean;
  alreadyDeleted: boolean;
};

// ========== 邮件问答相关 ==========

export type MailQaReference = {
  messageId: string;
  subject: string;
  fromName: string;
  fromAddress?: string;
  receivedDateTime?: string;
  dueAt?: string;
  dueDateLabel?: string;
  evidence?: string;
  type?: MailInsightType;
  quadrant?: MailQuadrant;
};

export type MailQaResponse = {
  generatedAt: string;
  question: string;
  intent: MailQaIntent;
  answer: string;
  horizonDays: number;
  timeZone: string;
  references: MailQaReference[];
};

// ========== 认证相关 ==========

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  locale: AiSummaryLocale;
};

export type SessionEnvelope = {
  ok: boolean;
  authenticated: boolean;
  user?: AuthUser;
};

export type AuthLoginEnvelope = {
  user: AuthUser;
};

export type AuthRegisterEnvelope = {
  pending: boolean;
  message: string;
  expiresInSeconds?: number;
};

export type AuthVerifyEnvelope = {
  user: AuthUser;
};

export type AuthMeEnvelope = {
  user: AuthUser;
};

// ========== 邮件知识库相关 ==========

export type MailKnowledgeRecord = {
  mailId: string;
  rawId: string;
  subject: string;
  personId: string;
  eventId: string | null;
  importanceScore: number;
  urgencyScore: number;
  quadrant: MailQuadrant;
  summary: string;
  receivedAt: string;
  processedAt: string;
  webLink?: string;
};

export type EventCluster = {
  eventId: string;
  name: string;
  summary: string;
  keyInfo: string[];
  relatedMailIds: string[];
  lastUpdated: string;
  tags: string[];
};

export type PersonProfile = {
  personId: string;
  email: string;
  name: string;
  profile: string;
  role: string;
  importance: number;
  recentInteractions: number;
  lastUpdated: string;
  avatarUrl?: string;
};

export type MailSubjectIndex = {
  mailId: string;
  subject: string;
  receivedAt: string;
};

export type MailScoreIndex = {
  mailId: string;
  importanceScore: number;
  urgencyScore: number;
  quadrant: MailQuadrant;
  timestamp: string;
};

export type KnowledgeBaseStats = {
  totalMails: number;
  totalEvents: number;
  totalPersons: number;
  processedAt: string;
  dateRange: {
    start: string;
    end: string;
  };
  quadrantDistribution: Record<MailQuadrant, number>;
};

export type KnowledgeBaseResult = {
  newMailsCount: number;
  newEventsCount: number;
  newPersonsCount: number;
  updatedEventsCount: number;
  updatedPersonsCount: number;
  stats: KnowledgeBaseStats;
};

// ========== API 响应信封类型 ==========

export type ApiResponse<T> = {
  ok: boolean;
  error?: string;
  errorCode?: string;
};

export type MailSourceMutationEnvelope = ApiResponse<{
  source: MailSourceProfile;
  activeSourceId: string;
}>;

export type MailSourceSelectEnvelope = ApiResponse<{
  activeSourceId: string;
}>;

export type MailSourceDeleteEnvelope = ApiResponse<{
  id: string;
  deleted: boolean;
  activeSourceId: string;
}>;

export type MailSourceVerifyEnvelope = ApiResponse<{
  sourceId: string;
  ready: boolean;
  routingStatus: MailSourceRoutingStatus;
}>;

export type MailSourcesEnvelope = ApiResponse<{
  sources: MailSourceProfile[];
  activeSourceId: string;
}>;

export type MailTriageEnvelope = ApiResponse<{
  sourceId: string;
  result: MailTriageResult;
}>;

export type MailInsightsEnvelope = ApiResponse<{
  sourceId: string;
  result: MailInsightsResult;
}>;

export type MailQueryEnvelope = ApiResponse<{
  answer: string;
}>;

export type CalendarSyncEnvelope = ApiResponse<{
  sourceId: string;
  result: MailCalendarSyncResponse;
  deduplicated: boolean;
}>;

export type CalendarDeleteEnvelope = ApiResponse<{
  sourceId: string;
  result: MailCalendarDeleteResponse;
}>;

export type OutlookLaunchEnvelope = ApiResponse<{
  status: "active" | "initiated" | "failed";
  hasActiveConnection: boolean;
  needsUserAction: boolean;
  redirectUrl: string | null;
  connectedAccountId: string | null;
  mailboxUserIdHint: string | null;
  sessionInstructions: string | null;
  message: string | null;
}>;

export type AutoConnectEnvelope = ApiResponse<{
  phase: string;
  message: string;
  activeSourceId: string;
}>;

export type NotificationPreferences = {
  urgentPushEnabled: boolean;
  dailyDigestEnabled: boolean;
  digestHour: number;
  digestMinute: number;
  digestTimeZone: string;
};

// ========== UI 相关常量 ==========

export const quadrantMeta: Record<MailQuadrant, { tone: string; badge: string; bgClass: string; textClass: string }> = {
  urgent_important: {
    tone: "text-red-700",
    badge: "bg-red-50 text-red-700 ring-red-200",
    bgClass: "bg-red-500",
    textClass: "text-red-600",
  },
  not_urgent_important: {
    tone: "text-blue-700",
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
    bgClass: "bg-blue-500",
    textClass: "text-blue-600",
  },
  urgent_not_important: {
    tone: "text-orange-700",
    badge: "bg-orange-50 text-orange-700 ring-orange-200",
    bgClass: "bg-orange-500",
    textClass: "text-orange-600",
  },
  not_urgent_not_important: {
    tone: "text-zinc-700",
    badge: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    bgClass: "bg-zinc-400",
    textClass: "text-zinc-500",
  },
};

export const quadrantLabelsByLocale: Record<AuthLocale, Record<MailQuadrant, string>> = {
  zh: {
    urgent_important: "紧急重要",
    not_urgent_important: "不紧急重要",
    urgent_not_important: "紧急不重要",
    not_urgent_not_important: "不紧急不重要",
  },
  en: {
    urgent_important: "Urgent & Important",
    not_urgent_important: "Important",
    urgent_not_important: "Urgent",
    not_urgent_not_important: "Later",
  },
  ja: {
    urgent_important: "緊急・重要",
    not_urgent_important: "重要",
    urgent_not_important: "緊急",
    not_urgent_not_important: "後回し",
  },
};

export const insightTypeLabels: Record<MailInsightType, string> = {
  ddl: "DDL",
  meeting: "会议",
  exam: "考试",
  event: "事项",
};

export const viewItems: Array<{ key: ViewKey }> = [
  { key: "inbox" },
  { key: "allmail" },
  { key: "stats" },
  { key: "calendar" },
  { key: "knowledgebase" },
  { key: "settings" },
];

export const viewLabelsByLocale: Record<AuthLocale, Record<ViewKey, { label: string; short: string }>> = {
  zh: {
    inbox: { label: "收件箱", short: "主页" },
    allmail: { label: "邮件历史", short: "历史" },
    stats: { label: "统计", short: "统计" },
    calendar: { label: "日历", short: "日历" },
    knowledgebase: { label: "知识库", short: "知识库" },
    settings: { label: "设置", short: "设置" },
  },
  en: {
    inbox: { label: "Inbox", short: "Home" },
    allmail: { label: "Mail History", short: "History" },
    stats: { label: "Stats", short: "Stats" },
    calendar: { label: "Calendar", short: "Cal" },
    knowledgebase: { label: "Knowledge Base", short: "KB" },
    settings: { label: "Settings", short: "Settings" },
  },
  ja: {
    inbox: { label: "受信箱", short: "ホーム" },
    allmail: { label: "メール履歴", short: "履歴" },
    stats: { label: "統計", short: "統計" },
    calendar: { label: "カレンダー", short: "予定" },
    knowledgebase: { label: "ナレッジベース", short: "知識" },
    settings: { label: "設定", short: "設定" },
  },
};

// ========== 工具函数 ==========

export function getQuadrantPriority(quadrant: MailQuadrant): number {
  switch (quadrant) {
    case "urgent_important":
      return 0;
    case "not_urgent_important":
      return 1;
    case "urgent_not_important":
      return 2;
    case "not_urgent_not_important":
      return 3;
  }
}

export function getQuadrantColor(quadrant: MailQuadrant): { bg: string; border: string; text: string } {
  switch (quadrant) {
    case "urgent_important":
      return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" };
    case "not_urgent_important":
      return { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" };
    case "urgent_not_important":
      return { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" };
    case "not_urgent_not_important":
      return { bg: "bg-zinc-50", border: "border-zinc-200", text: "text-zinc-700" };
  }
}
