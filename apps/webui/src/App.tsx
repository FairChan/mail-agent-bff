import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ViewKey = "inbox" | "stats" | "calendar" | "settings";
type AuthLocale = "zh" | "en" | "ja";
type AuthMode = "login" | "register";

type MailQuadrant =
  | "urgent_important"
  | "not_urgent_important"
  | "urgent_not_important"
  | "not_urgent_not_important";

type MailInsightType = "ddl" | "meeting" | "exam" | "event";

type TriageMailItem = {
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
};

type MailTriageResult = {
  generatedAt: string;
  total: number;
  counts: Record<MailQuadrant, number>;
  quadrants: Record<MailQuadrant, TriageMailItem[]>;
  allItems: TriageMailItem[];
};

type MailInsightItem = {
  messageId: string;
  subject: string;
  dueAt: string;
  dueDateLabel: string;
  type: MailInsightType;
  evidence?: string;
  aiSummary?: string;
};

type MailInsightsResult = {
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
};

type MailRoutingCheck = {
  required: boolean;
  status: "skipped" | "verified" | "failed" | "unverifiable";
  verified: boolean;
  message: string;
};

type MailSourceRoutingStatus = {
  verifiedAt: string;
  routingVerified: boolean;
  failFast: boolean;
  message: string;
  mailbox: MailRoutingCheck;
  connectedAccount: MailRoutingCheck;
};

type MailSourceProfile = {
  id: string;
  name: string;
  provider: "outlook";
  emailHint: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
  enabled: boolean;
  ready: boolean;
  routingStatus?: MailSourceRoutingStatus;
};

type MailSourcesEnvelope = {
  ok: boolean;
  result: {
    sources: MailSourceProfile[];
    activeSourceId: string;
  };
};

type MailSourceMutationEnvelope = {
  ok: boolean;
  result: {
    source: MailSourceProfile;
    activeSourceId: string;
  };
};

type MailSourceSelectEnvelope = {
  ok: boolean;
  result: {
    activeSourceId: string;
  };
};

type MailSourceDeleteEnvelope = {
  ok: boolean;
  result: {
    id: string;
    deleted: boolean;
    activeSourceId: string;
  };
};

type MailSourceVerifyEnvelope = {
  ok: boolean;
  result: {
    sourceId: string;
    ready: boolean;
    routingStatus: MailSourceRoutingStatus;
  };
};

type MailTriageEnvelope = {
  ok: boolean;
  sourceId: string;
  result: MailTriageResult;
};

type MailInsightsEnvelope = {
  ok: boolean;
  sourceId: string;
  result: MailInsightsResult;
};

type MailQueryEnvelope = {
  ok: boolean;
  result: {
    answer: string;
  };
};

type OutlookLaunchEnvelope = {
  ok: boolean;
  result: {
    status: "active" | "initiated" | "failed";
    hasActiveConnection: boolean;
    needsUserAction: boolean;
    redirectUrl: string | null;
    connectedAccountId: string | null;
    mailboxUserIdHint: string | null;
    sessionInstructions: string | null;
    message: string | null;
  };
};

type AutoConnectEnvelope = {
  ok: boolean;
  result: {
    phase: string;
    message: string;
    activeSourceId: string;
  };
};

type SessionEnvelope = {
  ok: boolean;
  authenticated: boolean;
  user?: AuthUser;
};

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  locale: "zh-CN" | "en-US" | "ja-JP";
};

type AuthLoginEnvelope = {
  user: AuthUser;
};

type AuthRegisterEnvelope = {
  user: AuthUser;
};

type AuthMeEnvelope = {
  user: AuthUser;
};

type AuthPreferencesEnvelope = {
  ok: boolean;
  user: AuthUser;
};

type CalendarSyncEnvelope = {
  ok: boolean;
  sourceId: string;
  result: {
    eventId: string;
    eventSubject: string;
    eventWebLink: string;
  };
  deduplicated: boolean;
};

type CalendarDeleteEnvelope = {
  ok: boolean;
  sourceId: string;
  result: {
    eventId: string;
    deleted: boolean;
    alreadyDeleted: boolean;
  };
};

type SyncedCalendarEvent = {
  eventId: string;
  eventWebLink?: string;
};

class HttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const bffBaseUrl = (import.meta.env.VITE_BFF_BASE_URL ?? "").replace(/\/$/, "");
const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const authLocaleStorageKey = "true-sight-auth-locale";
const requestLocaleHeaderName = "x-true-sight-locale";

const authMessages: Record<
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
  }
> = {
  zh: {
    brand: "True Sight",
    titleLogin: "登录 Email AI Agent",
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
  },
  en: {
    brand: "True Sight",
    titleLogin: "Sign In to Email AI Agent",
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
  },
  ja: {
    brand: "True Sight",
    titleLogin: "Email AI Agent にログイン",
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
  },
};

const viewItems: Array<{ key: ViewKey }> = [{ key: "inbox" }, { key: "stats" }, { key: "calendar" }, { key: "settings" }];

const viewLabelsByLocale: Record<AuthLocale, Record<ViewKey, { label: string; short: string }>> = {
  zh: {
    inbox: { label: "收件箱", short: "主页" },
    stats: { label: "统计", short: "统计" },
    calendar: { label: "日历", short: "日历" },
    settings: { label: "设置", short: "设置" },
  },
  en: {
    inbox: { label: "Inbox", short: "Home" },
    stats: { label: "Stats", short: "Stats" },
    calendar: { label: "Calendar", short: "Cal" },
    settings: { label: "Settings", short: "Settings" },
  },
  ja: {
    inbox: { label: "受信箱", short: "ホーム" },
    stats: { label: "統計", short: "統計" },
    calendar: { label: "カレンダー", short: "予定" },
    settings: { label: "設定", short: "設定" },
  },
};

function resolveRequestLocaleHeaderValue(): string {
  if (typeof window !== "undefined") {
    const storedLocale = window.localStorage.getItem(authLocaleStorageKey);
    if (storedLocale === "en") {
      return "en-US";
    }
    if (storedLocale === "zh") {
      return "zh-CN";
    }
    if (storedLocale === "ja") {
      return "ja-JP";
    }

    const browserLocale = window.navigator.language || "";
    if (/^ja\b/i.test(browserLocale)) {
      return "ja-JP";
    }
    if (/^en\b/i.test(browserLocale)) {
      return "en-US";
    }
  }

  return "zh-CN";
}

const quadrantMeta: Record<MailQuadrant, { tone: string; badge: string }> = {
  urgent_important: {
    tone: "text-red-700",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
  not_urgent_important: {
    tone: "text-blue-700",
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  urgent_not_important: {
    tone: "text-orange-700",
    badge: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  not_urgent_not_important: {
    tone: "text-zinc-700",
    badge: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  },
};

const quadrantLabelsByLocale: Record<AuthLocale, Record<MailQuadrant, string>> = {
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

function toAuthLocaleFromUserLocale(locale: AuthUser["locale"] | undefined | null): AuthLocale {
  if (!locale) {
    return "zh";
  }
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("en")) {
    return "en";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  return "zh";
}

function toUserLocaleFromAuthLocale(locale: AuthLocale): AuthUser["locale"] {
  if (locale === "en") {
    return "en-US";
  }
  if (locale === "ja") {
    return "ja-JP";
  }
  return "zh-CN";
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set(requestLocaleHeaderName, resolveRequestLocaleHeaderValue());

  const response = await fetch(`${bffBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const text = await response.text();
  const body = text ? safeJson(text) : {};

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error?: unknown }).error ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
    throw new HttpError(response.status, message, body);
  }

  return body as T;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalStringField(value: unknown, field: string): string | null {
  const record = asRecord(value);
  const candidate = record?.[field];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : null;
}

function readOptionalIntegerField(value: unknown, field: string): number | null {
  const record = asRecord(value);
  const candidate = record?.[field];
  return typeof candidate === "number" && Number.isInteger(candidate) ? candidate : null;
}

function generateAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}_${randomPart}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  return readOptionalStringField(error.payload, "errorCode");
}

function authFieldError(error: unknown, field: "email" | "password" | "username"): string | null {
  if (!(error instanceof HttpError)) {
    return null;
  }

  const payload = asRecord(error.payload);
  const fieldErrors = asRecord(payload?.fieldErrors);
  const value = fieldErrors?.[field];
  return typeof value === "string" ? value : null;
}

function authFriendlyMessage(error: unknown, locale: AuthLocale): string {
  const code = readOptionalStringField(error instanceof HttpError ? error.payload : null, "code");
  const zh = locale === "zh";
  if (code === "EMAIL_ALREADY_EXISTS") {
    return zh ? "该邮箱已注册，请直接登录。" : "This email is already registered.";
  }
  if (code === "INVALID_CREDENTIALS" || code === "UNAUTHORIZED") {
    return zh ? "邮箱或密码错误。" : "Invalid email or password.";
  }
  if (code === "UPSTREAM_UNAVAILABLE" || code === "AUTH_STORE_UNAVAILABLE") {
    return zh ? "认证服务暂时不可用，请稍后重试。" : "Authentication service is temporarily unavailable.";
  }
  if (error instanceof HttpError && error.status === 429) {
    return zh ? "请求过于频繁，请稍后重试。" : "Too many attempts. Please try again later.";
  }
  return zh ? userFacingErrorMessage(error) : errorMessage(error);
}

function isRoutingFailFastError(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 412) {
    return false;
  }

  const code = errorCode(error);
  return Boolean(code && code.startsWith("MAIL_SOURCE_"));
}

function userFacingErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "OUTLOOK_CONNECTION_REQUIRED") {
    return "当前邮箱源尚未完成 Outlook 授权，请在“设置”里点击“登录 Outlook”。";
  }
  if (code === "COMPOSIO_CONSUMER_KEY_INVALID") {
    return "服务器的 Composio Key 配置无效，请先修复服务端配置。";
  }
  if (code === "AUTH_STORE_UNAVAILABLE") {
    return "认证服务暂时不可用，请稍后重试。";
  }
  if (code === "SESSION_CLEANUP_FAILED") {
    return "登出清理暂时失败，请稍后重试。";
  }
  if (code === "MAIL_SOURCE_ROUTING_UNVERIFIED") {
    return "数据源尚未验证，请到设置页点击 verify。";
  }
  if (code === "MAIL_SOURCE_ROUTING_NOT_READY") {
    return "数据源验证未通过，请检查 connectedAccountId 和 mailboxUserId。";
  }
  if (error instanceof HttpError && (error.status === 502 || error.status === 504)) {
    return "邮件服务暂时不可用，请稍后重试。";
  }
  if (error instanceof HttpError && error.status === 503) {
    return "网关服务当前不可用，请检查 OpenClaw 与 Composio 连接状态。";
  }
  return errorMessage(error);
}

function sanitizeHttpUrl(rawUrl: string | undefined | null): URL | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function isAllowedOutlookWebHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const exactHosts = new Set([
    "outlook.office.com",
    "outlook.live.com",
    "outlook.office365.com",
    "outlook.office.de",
    "outlook.office.cn",
    "outlook.office.us",
  ]);
  if (exactHosts.has(normalized)) {
    return true;
  }

  const allowedSuffixes = [
    ".outlook.office.com",
    ".outlook.live.com",
    ".outlook.office365.com",
    ".outlook.office.de",
    ".outlook.office.cn",
    ".outlook.office.us",
  ];
  return allowedSuffixes.some((suffix) => normalized.endsWith(suffix));
}

function sanitizeExternalLink(rawUrl: string | undefined): string | null {
  const parsed = sanitizeHttpUrl(rawUrl);
  if (!parsed) {
    return null;
  }

  if (!isAllowedOutlookWebHost(parsed.hostname)) {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}

function sanitizeOutlookAuthLink(rawUrl: string | null): string | null {
  const parsed = sanitizeHttpUrl(rawUrl);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const allowlist = [
    "composio.dev",
    "composio.com",
    "connect.composio.dev",
    "login.microsoftonline.com",
    "login.live.com",
  ];
  const hostAllowed =
    allowlist.includes(host) ||
    host.endsWith(".composio.dev") ||
    host.endsWith(".composio.com") ||
    host.endsWith(".microsoftonline.com") ||
    host.endsWith(".live.com");
  if (!hostAllowed) {
    return null;
  }

  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocalhost) {
    return null;
  }

  return parsed.toString();
}

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDue(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }
  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTriageMailItem(value: unknown): TriageMailItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = toNonEmptyString(record.id);
  const subject = toNonEmptyString(record.subject);
  if (!id || !subject) {
    return null;
  }

  return {
    id,
    subject,
    fromName: toNonEmptyString(record.fromName) ?? "",
    fromAddress: toNonEmptyString(record.fromAddress) ?? "",
    bodyPreview: toNonEmptyString(record.bodyPreview) ?? "",
    webLink: toNonEmptyString(record.webLink) ?? "",
    aiSummary: toNonEmptyString(record.aiSummary) ?? undefined,
    isRead: typeof record.isRead === "boolean" ? record.isRead : undefined,
    importance: toNonEmptyString(record.importance) ?? undefined,
    quadrant: toNonEmptyString(record.quadrant) as MailQuadrant | undefined,
  };
}

function normalizeTriageResult(value: unknown): MailTriageResult | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const rawCounts = asRecord(record.counts);
  const counts: Record<MailQuadrant, number> = {
    urgent_important: Number(rawCounts?.urgent_important ?? 0) || 0,
    not_urgent_important: Number(rawCounts?.not_urgent_important ?? 0) || 0,
    urgent_not_important: Number(rawCounts?.urgent_not_important ?? 0) || 0,
    not_urgent_not_important: Number(rawCounts?.not_urgent_not_important ?? 0) || 0,
  };

  const rawQuadrants = asRecord(record.quadrants);
  const quadrants: Record<MailQuadrant, TriageMailItem[]> = {
    urgent_important: Array.isArray(rawQuadrants?.urgent_important)
      ? rawQuadrants.urgent_important.map(normalizeTriageMailItem).filter((item): item is TriageMailItem => item !== null)
      : [],
    not_urgent_important: Array.isArray(rawQuadrants?.not_urgent_important)
      ? rawQuadrants.not_urgent_important.map(normalizeTriageMailItem).filter((item): item is TriageMailItem => item !== null)
      : [],
    urgent_not_important: Array.isArray(rawQuadrants?.urgent_not_important)
      ? rawQuadrants.urgent_not_important.map(normalizeTriageMailItem).filter((item): item is TriageMailItem => item !== null)
      : [],
    not_urgent_not_important: Array.isArray(rawQuadrants?.not_urgent_not_important)
      ? rawQuadrants.not_urgent_not_important
          .map(normalizeTriageMailItem)
          .filter((item): item is TriageMailItem => item !== null)
      : [],
  };

  const allItems = Array.isArray(record.allItems)
    ? record.allItems.map(normalizeTriageMailItem).filter((item): item is TriageMailItem => item !== null)
    : [...quadrants.urgent_important, ...quadrants.not_urgent_important, ...quadrants.urgent_not_important, ...quadrants.not_urgent_not_important];

  const generatedAt = toNonEmptyString(record.generatedAt) ?? new Date().toISOString();
  const totalCandidate = Number(record.total);
  const total = Number.isFinite(totalCandidate) && totalCandidate >= 0 ? totalCandidate : allItems.length;

  return {
    generatedAt,
    total,
    counts,
    quadrants,
    allItems,
  };
}

function normalizeInsightItem(value: unknown): MailInsightItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const messageId = toNonEmptyString(record.messageId);
  const subject = toNonEmptyString(record.subject);
  const dueAt = toNonEmptyString(record.dueAt);
  if (!messageId || !subject || !dueAt) {
    return null;
  }

  const typeRaw = toNonEmptyString(record.type) as MailInsightType | null;
  const type: MailInsightType = typeRaw && ["ddl", "meeting", "exam", "event"].includes(typeRaw) ? typeRaw : "event";

  return {
    messageId,
    subject,
    dueAt,
    dueDateLabel: toNonEmptyString(record.dueDateLabel) ?? formatDue(dueAt),
    type,
    evidence: toNonEmptyString(record.evidence) ?? undefined,
    aiSummary: toNonEmptyString(record.aiSummary) ?? undefined,
  };
}

function normalizeInsightsResult(value: unknown): MailInsightsResult | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const upcoming = Array.isArray(record.upcoming)
    ? record.upcoming.map(normalizeInsightItem).filter((item): item is MailInsightItem => item !== null)
    : [];

  const tomorrowDdl = Array.isArray(record.tomorrowDdl)
    ? record.tomorrowDdl.map(normalizeInsightItem).filter((item): item is MailInsightItem => item !== null)
    : [];

  const rawDigest = asRecord(record.digest);
  const digest = rawDigest
    ? {
        total: Number(rawDigest.total ?? 0) || 0,
        unread: Number(rawDigest.unread ?? 0) || 0,
        urgentImportant: Number(rawDigest.urgentImportant ?? 0) || 0,
        highImportance: Number(rawDigest.highImportance ?? 0) || 0,
        upcomingCount: Number(rawDigest.upcomingCount ?? 0) || 0,
        tomorrowDdlCount: Number(rawDigest.tomorrowDdlCount ?? 0) || 0,
      }
    : undefined;

  return {
    generatedAt: toNonEmptyString(record.generatedAt) ?? undefined,
    horizonDays: Number(record.horizonDays) > 0 ? Number(record.horizonDays) : 7,
    timeZone: toNonEmptyString(record.timeZone) ?? clientTimeZone,
    digest,
    tomorrowDdl,
    upcoming,
  };
}

function normalizeRoutingCheck(value: unknown): MailRoutingCheck | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const statusRaw = toNonEmptyString(record.status) as MailRoutingCheck["status"] | null;
  const status: MailRoutingCheck["status"] =
    statusRaw && ["skipped", "verified", "failed", "unverifiable"].includes(statusRaw) ? statusRaw : "skipped";

  return {
    required: Boolean(record.required),
    status,
    verified: Boolean(record.verified),
    message: toNonEmptyString(record.message) ?? "",
  };
}

function normalizeRoutingStatus(value: unknown): MailSourceRoutingStatus | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const mailbox = normalizeRoutingCheck(record.mailbox);
  const connectedAccount = normalizeRoutingCheck(record.connectedAccount);
  if (!mailbox || !connectedAccount) {
    return undefined;
  }

  return {
    verifiedAt: toNonEmptyString(record.verifiedAt) ?? new Date().toISOString(),
    routingVerified: Boolean(record.routingVerified),
    failFast: Boolean(record.failFast),
    message: toNonEmptyString(record.message) ?? "",
    mailbox,
    connectedAccount,
  };
}

function normalizeSourceProfile(value: unknown): MailSourceProfile | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = toNonEmptyString(record.id);
  const name = toNonEmptyString(record.name);
  const providerRaw = toNonEmptyString(record.provider);
  const emailHint = toNonEmptyString(record.emailHint) ?? "";
  if (!id || !name || providerRaw !== "outlook") {
    return null;
  }

  return {
    id,
    name,
    provider: "outlook",
    emailHint,
    mailboxUserId: toNonEmptyString(record.mailboxUserId) ?? undefined,
    connectedAccountId: toNonEmptyString(record.connectedAccountId) ?? undefined,
    enabled: Boolean(record.enabled),
    ready: Boolean(record.ready),
    routingStatus: normalizeRoutingStatus(record.routingStatus),
  };
}

function buildCalendarKey(item: MailInsightItem): string {
  return `${item.messageId}|${item.type}|${item.dueAt}`;
}

function resolveMailboxFromSources(
  sources: MailSourceProfile[],
  activeSourceId: string,
  previousMailbox: string
): string {
  const source = sources.find((item) => item.id === activeSourceId) ?? sources[0];
  const mailbox = source?.mailboxUserId?.trim() || source?.emailHint?.trim();
  if (mailbox && mailbox.length > 0) {
    return mailbox;
  }
  if (source?.enabled && source?.ready) {
    return "Outlook (connected, mailbox id unavailable)";
  }
  return previousMailbox;
}

function findSafeReadySource(sources: MailSourceProfile[]): MailSourceProfile | null {
  return sources.find((item) => item.enabled && item.ready) ?? null;
}

function statusBadgeClass(active: boolean): string {
  return active
    ? "bg-zinc-900 text-white ring-zinc-900"
    : "bg-white/70 text-zinc-700 ring-zinc-300 hover:bg-zinc-100";
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.4 2.3 2.6.6-.3 2.7 1.8 2-1.8 2 .3 2.7-2.6.6L12 21l-1.4-2.3-2.6-.6.3-2.7-1.8-2 1.8-2-.3-2.7 2.6-.6L12 3Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v6h-6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M10 14 21 3" />
      <path d="M15 3h6v6" />
      <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11.5 21 3l-8.5 18-1.8-7.7L3 11.5Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18h5l-1.4-1.4A2 2 0 0 1 18 15.2V11a6 6 0 1 0-12 0v4.2a2 2 0 0 1-.6 1.4L4 18h5" />
      <path d="M9 18a3 3 0 0 0 6 0" />
    </svg>
  );
}

export default function App() {
  const [view, setView] = useState<ViewKey>("inbox");

  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authLocale, setAuthLocale] = useState<AuthLocale>(() => {
    const fromStorage =
      typeof window === "undefined" ? null : window.localStorage.getItem(authLocaleStorageKey);
    if (fromStorage === "en") {
      return "en";
    }
    if (fromStorage === "ja") {
      return "ja";
    }
    return "zh";
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRemember, setAuthRemember] = useState(true);
  const [registerName, setRegisterName] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [authFieldErrors, setAuthFieldErrors] = useState<Partial<Record<"email" | "password" | "username", string>>>(
    {}
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSessionProbeError, setAuthSessionProbeError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [sources, setSources] = useState<MailSourceProfile[]>([]);
  const [activeSourceId, setActiveSourceId] = useState("default_outlook");
  const [connectedMailbox, setConnectedMailbox] = useState("");

  const [triage, setTriage] = useState<MailTriageResult | null>(null);
  const [insights, setInsights] = useState<MailInsightsResult | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  const [calendarBusyByKey, setCalendarBusyByKey] = useState<Record<string, boolean>>({});
  const [calendarEventsByKey, setCalendarEventsByKey] = useState<Record<string, SyncedCalendarEvent>>({});

  const [outlookBusy, setOutlookBusy] = useState(false);
  const [outlookInfo, setOutlookInfo] = useState<string | null>(null);
  const [outlookError, setOutlookError] = useState<string | null>(null);
  const [outlookRedirectUrl, setOutlookRedirectUrl] = useState<string | null>(null);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);

  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceInfo, setSourceInfo] = useState<string | null>(null);

  const [newSourceLabel, setNewSourceLabel] = useState("");
  const [newMailboxUserId, setNewMailboxUserId] = useState("");
  const [newConnectedAccountId, setNewConnectedAccountId] = useState("");

  const dashboardRequestSeqRef = useRef(0);
  const outlookRequestSeqRef = useRef(0);
  const authSessionEpochRef = useRef(0);
  const focusRefreshCleanupRef = useRef<(() => void) | null>(null);
  const outlookPopupRef = useRef<Window | null>(null);
  const outlookBusyTimerRef = useRef<number | null>(null);
  const outlookAuthAttemptRef = useRef<string | null>(null);
  const localePreferenceSeqRef = useRef(0);
  const authCopy = useMemo(() => authMessages[authLocale], [authLocale]);
  const viewLabels = useMemo(() => viewLabelsByLocale[authLocale], [authLocale]);
  const quadrantLabels = useMemo(() => quadrantLabelsByLocale[authLocale], [authLocale]);
  const uiCopy = useMemo(
    () =>
      authLocale === "zh"
        ? {
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
          }
        : authLocale === "ja"
          ? {
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
            }
        : {
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
          },
    [authLocale]
  );

  async function persistLocalePreference(nextLocale: AuthLocale) {
    if (!isAuthenticated || !currentUser) {
      return;
    }

    const requestSeq = localePreferenceSeqRef.current + 1;
    localePreferenceSeqRef.current = requestSeq;
    const nextUserLocale = toUserLocaleFromAuthLocale(nextLocale);
    const previousUser = currentUser;
    setCurrentUser({
      ...currentUser,
      locale: nextUserLocale,
    });
    try {
      const response = await fetchJson<AuthPreferencesEnvelope>("/api/auth/preferences", {
        method: "POST",
        body: JSON.stringify({
          locale: nextUserLocale,
        }),
      });
      if (requestSeq !== localePreferenceSeqRef.current) {
        return;
      }
      setCurrentUser(response.user);
    } catch (error) {
      if (requestSeq !== localePreferenceSeqRef.current) {
        return;
      }
      if (handleUnauthorizedError(error)) {
        return;
      }
      setCurrentUser(previousUser);
    }
  }

  function onSelectAuthLocale(nextLocale: AuthLocale) {
    if (nextLocale === authLocale) {
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(authLocaleStorageKey, nextLocale);
    }
    setAuthLocale(nextLocale);
    void persistLocalePreference(nextLocale);
  }

  function clearOutlookBusyTimer() {
    if (outlookBusyTimerRef.current !== null) {
      window.clearTimeout(outlookBusyTimerRef.current);
      outlookBusyTimerRef.current = null;
    }
  }

  function clearOutlookAuthAttempt() {
    outlookAuthAttemptRef.current = null;
  }

  function settleOutlookAuthAttempt(attemptId: string | null): boolean {
    if (!attemptId || outlookAuthAttemptRef.current !== attemptId) {
      return false;
    }
    clearOutlookAuthAttempt();
    clearOutlookBusyTimer();
    setOutlookBusy(false);
    outlookPopupRef.current = null;
    return true;
  }

  function armOutlookBusyTimeout(attemptId: string) {
    clearOutlookBusyTimer();
    outlookBusyTimerRef.current = window.setTimeout(() => {
      if (outlookAuthAttemptRef.current !== attemptId) {
        return;
      }
      settleOutlookAuthAttempt(attemptId);
    }, 120000);
  }

  useEffect(() => {
    window.localStorage.setItem(authLocaleStorageKey, authLocale);
    document.documentElement.lang =
      authLocale === "zh" ? "zh-CN" : authLocale === "ja" ? "ja-JP" : "en";
  }, [authLocale]);

  const counts = useMemo(
    () =>
      triage?.counts ?? {
        urgent_important: 0,
        not_urgent_important: 0,
        urgent_not_important: 0,
        not_urgent_not_important: 0,
      },
    [triage]
  );

  const allMailItems = useMemo(() => {
    if (!triage?.allItems?.length) {
      return [];
    }
    return triage.allItems;
  }, [triage]);

  const unreadCount = useMemo(() => allMailItems.filter((item) => !item.isRead).length, [allMailItems]);

  const topSenders = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of allMailItems) {
      const key =
        item.fromName?.trim() || item.fromAddress?.trim() || (authLocale === "zh" ? "未知发件人" : "Unknown sender");
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return [...counter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [allMailItems, authLocale]);

  const upcomingItems = insights?.upcoming ?? [];
  const urgentItems = triage?.quadrants.urgent_important ?? [];
  const importantItems = triage?.quadrants.not_urgent_important ?? [];

  function resetDashboardForNoData(message: string) {
    setTriage(null);
    setInsights(null);
    setDashboardError(message);
  }

  function updateSourceSnapshot(snapshot: MailSourcesEnvelope["result"]) {
    setSources(snapshot.sources);
    setActiveSourceId(snapshot.activeSourceId || "default_outlook");
    setConnectedMailbox((previous) => resolveMailboxFromSources(snapshot.sources, snapshot.activeSourceId, previous));
  }

  async function loadSourceSnapshot(): Promise<MailSourcesEnvelope["result"]> {
    const sourceResponse = await fetchJson<MailSourcesEnvelope>("/api/mail/sources");
    const result = asRecord(sourceResponse.result);
    const sourcesRaw = result?.sources;
    const activeSourceIdRaw = toNonEmptyString(result?.activeSourceId) ?? "default_outlook";
    if (!Array.isArray(sourcesRaw)) {
      throw new Error("Invalid /api/mail/sources response shape");
    }

    const normalizedSources = sourcesRaw
      .map((source) => normalizeSourceProfile(source))
      .filter((source): source is MailSourceProfile => source !== null);

    const ensuredSources =
      normalizedSources.length > 0
        ? normalizedSources
        : [
            {
              id: "default_outlook",
              name: "Primary Outlook",
              provider: "outlook" as const,
              emailHint: "",
              enabled: true,
              ready: false,
            },
          ];

    const activeSourceId = ensuredSources.some((source) => source.id === activeSourceIdRaw)
      ? activeSourceIdRaw
      : ensuredSources[0].id;

    const normalizedSnapshot: MailSourcesEnvelope["result"] = {
      sources: ensuredSources,
      activeSourceId,
    };

    updateSourceSnapshot(normalizedSnapshot);
    return normalizedSnapshot;
  }

  async function loadDashboardBySource(sourceId: string): Promise<{
    triage: MailTriageResult;
    insights: MailInsightsResult;
  }> {
    const [triageResponse, insightResponse] = await Promise.all([
      fetchJson<MailTriageEnvelope>(`/api/mail/triage?limit=35&sourceId=${encodeURIComponent(sourceId)}`),
      fetchJson<MailInsightsEnvelope>(
        `/api/mail/insights?limit=35&horizonDays=7&tz=${encodeURIComponent(clientTimeZone)}&sourceId=${encodeURIComponent(sourceId)}`
      ),
    ]);

    const triage = normalizeTriageResult(triageResponse.result);
    if (!triage) {
      throw new Error("Invalid /api/mail/triage response shape");
    }
    const insights = normalizeInsightsResult(insightResponse.result);
    if (!insights) {
      throw new Error("Invalid /api/mail/insights response shape");
    }

    return {
      triage,
      insights,
    };
  }

  async function refreshDashboard(preferredSourceId?: string) {
    const requestSeq = ++dashboardRequestSeqRef.current;
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const snapshot = await loadSourceSnapshot();
      if (requestSeq !== dashboardRequestSeqRef.current) {
        return;
      }

      const requestedSourceId = preferredSourceId ?? snapshot.activeSourceId;
      const requestedSource = snapshot.sources.find((item) => item.id === requestedSourceId && item.enabled) ?? null;

      if (!requestedSource) {
        resetDashboardForNoData("当前没有可用的数据源。请先在设置页添加并验证邮箱源。");
        return;
      }

      let querySource = requestedSource;
      if (!requestedSource.ready) {
        const safeSource = findSafeReadySource(snapshot.sources);
        if (!safeSource) {
          resetDashboardForNoData("当前数据源尚未验证可用，请到设置页点击 verify。 ");
          return;
        }

        if (safeSource.id !== snapshot.activeSourceId) {
          try {
            await fetchJson<MailSourceSelectEnvelope>("/api/mail/sources/select", {
              method: "POST",
              body: JSON.stringify({ id: safeSource.id }),
            });
          } catch {
            // Ignore select failure and continue with direct query.
          }
        }

        querySource = safeSource;
        setActiveSourceId(safeSource.id);
        setDashboardError("当前数据源未就绪，已自动切换到可用数据源。");
      }

      const data = await loadDashboardBySource(querySource.id);
      if (requestSeq !== dashboardRequestSeqRef.current) {
        return;
      }

      setTriage(data.triage);
      setInsights(data.insights);
    } catch (error) {
      if (requestSeq !== dashboardRequestSeqRef.current) {
        return;
      }

      if (handleUnauthorizedError(error)) {
        return;
      } else if (isRoutingFailFastError(error)) {
        try {
          const snapshot = await loadSourceSnapshot();
          if (requestSeq !== dashboardRequestSeqRef.current) {
            return;
          }

          const safeSource = findSafeReadySource(snapshot.sources);
          if (!safeSource) {
            resetDashboardForNoData("当前数据源未通过 Fail-fast 校验，且没有可回滚的数据源。");
            return;
          }

          if (safeSource.id !== snapshot.activeSourceId) {
            try {
              await fetchJson<MailSourceSelectEnvelope>("/api/mail/sources/select", {
                method: "POST",
                body: JSON.stringify({ id: safeSource.id }),
              });
            } catch {
              // Ignore selection failure and continue querying safe source directly.
            }
          }

          const fallback = await loadDashboardBySource(safeSource.id);
          if (requestSeq !== dashboardRequestSeqRef.current) {
            return;
          }
          setActiveSourceId(safeSource.id);
          setConnectedMailbox((previous) => resolveMailboxFromSources(snapshot.sources, safeSource.id, previous));
          setTriage(fallback.triage);
          setInsights(fallback.insights);
          setDashboardError("当前数据源校验失败，已自动回滚到可用数据源。");
        } catch {
          resetDashboardForNoData("当前数据源未通过 Fail-fast 校验，请在设置页重新 verify 或切换数据源。");
        }
      } else {
        setDashboardError(userFacingErrorMessage(error));
      }
    } finally {
      if (requestSeq === dashboardRequestSeqRef.current) {
        setDashboardLoading(false);
      }
    }
  }

  async function bootstrapSession() {
    setAuthChecking(true);
    setAuthError(null);
    setAuthSessionProbeError(null);

    try {
      const session = await fetchJson<SessionEnvelope>("/api/auth/session");
      setIsAuthenticated(session.authenticated);
      setCurrentUser(session.user ?? null);
      if (session.user?.locale) {
        setAuthLocale(toAuthLocaleFromUserLocale(session.user.locale));
      }

      if (session.authenticated) {
        if (!session.user) {
          try {
            const me = await fetchJson<AuthMeEnvelope>("/api/auth/me");
            if (me?.user?.id && me.user.email) {
              setCurrentUser(me.user);
              setAuthLocale(toAuthLocaleFromUserLocale(me.user.locale));
            }
          } catch {
            // If /me fails, keep session-level authenticated state and continue dashboard bootstrap.
          }
        }
        await refreshDashboard();
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        setIsAuthenticated(false);
        setCurrentUser(null);
      } else {
        setAuthSessionProbeError(userFacingErrorMessage(error));
      }
    } finally {
      setAuthChecking(false);
    }
  }

  useEffect(() => {
    void bootstrapSession();

    return () => {
      clearOutlookBusyTimer();
      clearOutlookAuthAttempt();
      if (focusRefreshCleanupRef.current) {
        focusRefreshCleanupRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel("true-sight-outlook-auth");
    const terminalStatuses = new Set(["active", "failed", "ready"]);
    channel.onmessage = (event) => {
      const payload = asRecord(event.data);
      if (!payload || payload.type !== "outlook-auth-bridge") {
        return;
      }
      if (!isAuthenticated) {
        return;
      }

      const attemptId = readOptionalStringField(payload, "attemptId");
      const expectedAttemptId = outlookAuthAttemptRef.current;
      if (!attemptId || !expectedAttemptId || attemptId !== expectedAttemptId) {
        return;
      }

      const sessionEpoch = readOptionalIntegerField(payload, "sessionEpoch");
      if (sessionEpoch === null || sessionEpoch !== authSessionEpochRef.current) {
        return;
      }

      const status = readOptionalStringField(payload, "status");
      const message = readOptionalStringField(payload, "message");
      const error = readOptionalStringField(payload, "error");
      const accountId = readOptionalStringField(payload, "connectedAccountId");
      const redirectUrl = sanitizeOutlookAuthLink(readOptionalStringField(payload, "redirectUrl"));

      if (message) {
        setOutlookInfo(message);
      }
      if (error) {
        setOutlookError(error);
      }
      if (accountId) {
        setConnectedAccountId(accountId);
      }
      if (redirectUrl) {
        setOutlookRedirectUrl(redirectUrl);
      }

      if (status && terminalStatuses.has(status) && outlookAuthAttemptRef.current === attemptId) {
        outlookAuthAttemptRef.current = null;
        if (outlookBusyTimerRef.current !== null) {
          window.clearTimeout(outlookBusyTimerRef.current);
          outlookBusyTimerRef.current = null;
        }
        setOutlookBusy(false);
        outlookPopupRef.current = null;
      }
    };

    return () => {
      channel.close();
    };
  }, [isAuthenticated]);

  function registerRefreshOnFocus(expectedAttemptId: string) {
    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }

    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      focusRefreshCleanupRef.current = null;
      const popupClosed = !outlookPopupRef.current || outlookPopupRef.current.closed;
      if (popupClosed) {
        settleOutlookAuthAttempt(expectedAttemptId);
      }
      void refreshDashboard();
      void loadSourceSnapshot().catch(() => undefined);
    };

    window.addEventListener("focus", onFocus, { once: true });
    focusRefreshCleanupRef.current = () => {
      window.removeEventListener("focus", onFocus);
    };
  }

  function authFieldMessage(key: string | null): string | null {
    if (!key) {
      return null;
    }

    const zh = authLocale === "zh";
    if (key === "emailRequired") {
      return zh ? "请输入邮箱。" : "Email is required.";
    }
    if (key === "invalidEmail") {
      return zh ? "请输入有效邮箱地址。" : "Please enter a valid email address.";
    }
    if (key === "passwordRequired") {
      return zh ? "请输入密码。" : "Password is required.";
    }
    if (key === "passwordLength") {
      return zh ? "密码至少 8 位。" : "Password must be at least 8 characters.";
    }
    if (key === "usernameRequired") {
      return zh ? "请输入昵称。" : "Display name is required.";
    }

    return key;
  }

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = authEmail.trim();
    const password = authPassword;
    if (!email || !password) {
      setAuthError(authLocale === "zh" ? "请填写邮箱和密码。" : "Please enter email and password.");
      setAuthFieldErrors({
        ...(email ? {} : { email: authLocale === "zh" ? "请输入邮箱。" : "Email is required." }),
        ...(password ? {} : { password: authLocale === "zh" ? "请输入密码。" : "Password is required." }),
      });
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthFieldErrors({});

    try {
      const response = await fetchJson<AuthLoginEnvelope>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          remember: authRemember,
        }),
      });
      setIsAuthenticated(true);
      authSessionEpochRef.current += 1;
      setCurrentUser(response.user);
      setAuthLocale(toAuthLocaleFromUserLocale(response.user.locale));
      setAuthPassword("");
      setRegisterConfirmPassword("");
      setAuthSessionProbeError(null);
      setView("inbox");
      setDashboardError(null);
      setSourceError(null);
      setSourceInfo(null);
      await refreshDashboard();
    } catch (error) {
      setAuthFieldErrors({
        ...(authFieldError(error, "email")
          ? { email: authFieldMessage(authFieldError(error, "email")) ?? undefined }
          : {}),
        ...(authFieldError(error, "password")
          ? { password: authFieldMessage(authFieldError(error, "password")) ?? undefined }
          : {}),
      });
      setAuthError(authFriendlyMessage(error, authLocale));
      setAuthPassword("");
      setRegisterConfirmPassword("");
    } finally {
      setAuthBusy(false);
    }
  }

  async function onRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = authEmail.trim();
    const username = registerName.trim();
    const password = authPassword;
    const confirmPassword = registerConfirmPassword;
    const fieldErrors: Partial<Record<"email" | "password" | "username", string>> = {};

    if (!email) {
      fieldErrors.email = authLocale === "zh" ? "请输入邮箱。" : "Email is required.";
    }
    if (!username) {
      fieldErrors.username = authLocale === "zh" ? "请输入昵称。" : "Display name is required.";
    }
    if (!password) {
      fieldErrors.password = authLocale === "zh" ? "请输入密码。" : "Password is required.";
    } else if (password.trim().length < 8) {
      fieldErrors.password = authLocale === "zh" ? "密码至少 8 位。" : "Password must be at least 8 characters.";
    } else if (password !== confirmPassword) {
      fieldErrors.password = authLocale === "zh" ? "两次输入的密码不一致。" : "Passwords do not match.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      setAuthFieldErrors(fieldErrors);
      setAuthError(authLocale === "zh" ? "请修正表单后重试。" : "Please fix the form and retry.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthFieldErrors({});

    try {
      const response = await fetchJson<AuthRegisterEnvelope>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          username,
          password,
        }),
      });

      setIsAuthenticated(true);
      authSessionEpochRef.current += 1;
      setCurrentUser(response.user);
      setAuthLocale(toAuthLocaleFromUserLocale(response.user.locale));
      setAuthPassword("");
      setRegisterConfirmPassword("");
      setAuthSessionProbeError(null);
      setView("inbox");
      setDashboardError(null);
      setSourceError(null);
      setSourceInfo(null);
      await refreshDashboard();
    } catch (error) {
      setAuthFieldErrors({
        ...(authFieldError(error, "email")
          ? { email: authFieldMessage(authFieldError(error, "email")) ?? undefined }
          : {}),
        ...(authFieldError(error, "username")
          ? { username: authFieldMessage(authFieldError(error, "username")) ?? undefined }
          : {}),
        ...(authFieldError(error, "password")
          ? { password: authFieldMessage(authFieldError(error, "password")) ?? undefined }
          : {}),
      });
      setAuthError(authFriendlyMessage(error, authLocale));
      setAuthPassword("");
      setRegisterConfirmPassword("");
    } finally {
      setAuthBusy(false);
    }
  }

  function clearUserScopedInputs() {
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setAuthRemember(true);
    setRegisterName("");
    setRegisterConfirmPassword("");
    setAuthFieldErrors({});
    setNewSourceLabel("");
    setNewMailboxUserId("");
    setNewConnectedAccountId("");
    setAgentInput("");
  }

  function resetUiForUnauthorized() {
    dashboardRequestSeqRef.current += 1;
    outlookRequestSeqRef.current += 1;
    authSessionEpochRef.current += 1;
    clearOutlookAuthAttempt();

    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }
    clearOutlookBusyTimer();
    if (outlookPopupRef.current && !outlookPopupRef.current.closed) {
      try {
        outlookPopupRef.current.close();
      } catch {
        // Ignore close failures.
      }
    }
    outlookPopupRef.current = null;

    setIsAuthenticated(false);
    setCurrentUser(null);
    setAuthSessionProbeError(null);
    setAuthBusy(false);
    clearUserScopedInputs();
    setSourcesBusy(false);
    setOutlookBusy(false);
    setDashboardLoading(false);
    setAgentBusy(false);

    setSources([]);
    setActiveSourceId("default_outlook");
    setConnectedMailbox("");
    setTriage(null);
    setInsights(null);
    setDashboardError(null);
    setSourceError(null);
    setSourceInfo(null);
    setAgentAnswer(null);
    setAgentError(null);
    setOutlookInfo(null);
    setOutlookError(null);
    setOutlookRedirectUrl(null);
    setConnectedAccountId(null);
    setCalendarBusyByKey({});
    setCalendarEventsByKey({});
  }

  function handleUnauthorizedError(error: unknown): boolean {
    if (!(error instanceof HttpError) || error.status !== 401) {
      return false;
    }
    resetUiForUnauthorized();
    setAuthError(authLocale === "zh" ? "会话已过期，请重新登录。" : "Session expired. Please sign in again.");
    return true;
  }

  async function onLogout() {
    dashboardRequestSeqRef.current += 1;
    outlookRequestSeqRef.current += 1;
    authSessionEpochRef.current += 1;
    clearOutlookAuthAttempt();

    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }
    clearOutlookBusyTimer();
    if (outlookPopupRef.current && !outlookPopupRef.current.closed) {
      try {
        outlookPopupRef.current.close();
      } catch {
        // Ignore close failures.
      }
    }
    outlookPopupRef.current = null;

    setAuthBusy(true);
    try {
      await fetchJson<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch {
      // Ignore logout cleanup failures.
    }

    setIsAuthenticated(false);
    setCurrentUser(null);
    setAuthSessionProbeError(null);
    setAuthBusy(false);
    clearUserScopedInputs();
    setView("inbox");

    setSources([]);
    setActiveSourceId("default_outlook");
    setConnectedMailbox("");

    setTriage(null);
    setInsights(null);
    setDashboardError(null);

    setAgentAnswer(null);
    setAgentError(null);

    setOutlookBusy(false);
    setOutlookInfo(null);
    setOutlookError(null);
    setOutlookRedirectUrl(null);
    setConnectedAccountId(null);

    setSourcesBusy(false);
    setSourceError(null);
    setSourceInfo(null);

    setCalendarBusyByKey({});
    setCalendarEventsByKey({});
  }

  async function onLaunchOutlookWindow() {
    if (!isAuthenticated || outlookBusy) {
      return;
    }

    if (outlookPopupRef.current && !outlookPopupRef.current.closed) {
      outlookPopupRef.current.focus();
      setOutlookInfo("授权窗口已打开，请在该窗口继续完成 Outlook 登录。");
      return;
    }

    const attemptId = generateAttemptId();
    const bridgeUrlObject = new URL("/outlook-auth-bridge.html", window.location.origin);
    bridgeUrlObject.searchParams.set("attemptId", attemptId);
    bridgeUrlObject.searchParams.set("sessionEpoch", String(authSessionEpochRef.current));
    const bridgeUrl = bridgeUrlObject.toString();
    const bridgeFallbackUrl = new URL("/outlook-auth-bridge.html", window.location.origin).toString();
    const popup = window.open(
      bridgeUrl,
      "_blank",
      "popup=yes,width=560,height=780,noopener,noreferrer"
    );
    const popupUnavailableMessage = "浏览器未自动打开授权弹窗，请点击下方“打开授权页”完成授权。";

    outlookAuthAttemptRef.current = attemptId;
    setOutlookBusy(true);
    armOutlookBusyTimeout(attemptId);
    setOutlookError(null);
    setOutlookInfo(null);
    setOutlookRedirectUrl(null);
    setConnectedAccountId(null);

    if (popup && !popup.closed) {
      outlookPopupRef.current = popup;
      popup.focus();
      setOutlookInfo("已打开 Composio 授权窗口，请在新窗口完成 Outlook 登录。");
      registerRefreshOnFocus(attemptId);
    } else {
      settleOutlookAuthAttempt(attemptId);
      setOutlookRedirectUrl(bridgeFallbackUrl);
      setOutlookInfo(popupUnavailableMessage);
      registerRefreshOnFocus(attemptId);
    }
  }

  async function onReloadSources() {
    setSourcesBusy(true);
    setSourceError(null);

    try {
      await loadSourceSnapshot();
      setSourceInfo("数据源快照已刷新。");
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setSourceError(userFacingErrorMessage(error));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function onSelectSource(sourceId: string) {
    setSourcesBusy(true);
    setSourceError(null);

    try {
      await fetchJson<MailSourceSelectEnvelope>("/api/mail/sources/select", {
        method: "POST",
        body: JSON.stringify({ id: sourceId }),
      });
      setSourceInfo(`已切换到数据源 ${sourceId}`);
      await refreshDashboard(sourceId);
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setSourceError(userFacingErrorMessage(error));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function onVerifySource(sourceId: string) {
    setSourcesBusy(true);
    setSourceError(null);

    try {
      const response = await fetchJson<MailSourceVerifyEnvelope>("/api/mail/sources/verify", {
        method: "POST",
        body: JSON.stringify({ sourceId }),
      });
      if (!asRecord(response.result)) {
        throw new Error("Invalid /api/mail/sources/verify response shape");
      }
      setSourceInfo(response.result.ready ? `数据源 ${sourceId} 验证通过。` : `数据源 ${sourceId} 尚未就绪。`);
      await loadSourceSnapshot();
      if (sourceId === activeSourceId) {
        await refreshDashboard(sourceId);
      }
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setSourceError(userFacingErrorMessage(error));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function onDeleteSource(sourceId: string) {
    setSourcesBusy(true);
    setSourceError(null);

    try {
      await fetchJson<MailSourceDeleteEnvelope>("/api/mail/sources/delete", {
        method: "POST",
        body: JSON.stringify({ id: sourceId }),
      });
      setSourceInfo(`数据源 ${sourceId} 已删除。`);
      await refreshDashboard();
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setSourceError(userFacingErrorMessage(error));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function onCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = newSourceLabel.trim();
    const mailboxUserId = newMailboxUserId.trim();
    const connectedAccount = newConnectedAccountId.trim();

    if (!label || !mailboxUserId || !connectedAccount) {
      setSourceError("请完整填写数据源标签、Mailbox User ID、Composio Account ID。");
      return;
    }

    setSourcesBusy(true);
    setSourceError(null);

    try {
      const createResponse = await fetchJson<MailSourceMutationEnvelope>("/api/mail/sources", {
        method: "POST",
        body: JSON.stringify({
          label,
          mailboxUserId,
          connectedAccountId: connectedAccount,
          provider: "outlook",
        }),
      });
      if (!asRecord(createResponse.result) || !asRecord(createResponse.result.source)) {
        throw new Error("Invalid /api/mail/sources response shape");
      }
      const createdSourceId = createResponse.result.source.id;
      if (typeof createdSourceId !== "string" || createdSourceId.length === 0) {
        throw new Error("Invalid source id from /api/mail/sources");
      }

      await fetchJson<MailSourceVerifyEnvelope>("/api/mail/sources/verify", {
        method: "POST",
        body: JSON.stringify({ sourceId: createdSourceId }),
      });

      setNewSourceLabel("");
      setNewMailboxUserId("");
      setNewConnectedAccountId("");
      setSourceInfo(`数据源 ${createdSourceId} 已创建并完成验证。`);

      await onSelectSource(createdSourceId);
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setSourceError(userFacingErrorMessage(error));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function onAutoConnectSource() {
    setSourcesBusy(true);
    setSourceError(null);

    try {
      const response = await fetchJson<AutoConnectEnvelope>("/api/mail/sources/auto-connect/outlook", {
        method: "POST",
        body: JSON.stringify({ autoSelect: true }),
      });
      if (!asRecord(response.result)) {
        throw new Error("Invalid /api/mail/sources/auto-connect/outlook response shape");
      }

      setSourceInfo(response.result.message || "已执行自动接入流程。");
      await refreshDashboard(response.result.activeSourceId);
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setSourceError(userFacingErrorMessage(error));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function onAskAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = agentInput.trim();
    if (!question) {
      return;
    }

    setAgentBusy(true);
    setAgentError(null);
    setAgentAnswer(null);

    try {
      const response = await fetchJson<MailQueryEnvelope>("/api/mail/query", {
        method: "POST",
        body: JSON.stringify({
          question,
          limit: 35,
          horizonDays: 7,
          tz: clientTimeZone,
          sourceId: activeSourceId,
        }),
      });
      if (!asRecord(response.result) || typeof response.result.answer !== "string") {
        throw new Error("Invalid /api/mail/query response shape");
      }
      setAgentAnswer(response.result.answer);
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setAgentError(userFacingErrorMessage(error));
    } finally {
      setAgentBusy(false);
    }
  }

  async function onSyncCalendar(item: MailInsightItem) {
    const key = buildCalendarKey(item);
    setCalendarBusyByKey((previous) => ({ ...previous, [key]: true }));

    try {
      const response = await fetchJson<CalendarSyncEnvelope>("/api/mail/calendar/sync", {
        method: "POST",
        body: JSON.stringify({
          sourceId: activeSourceId,
          messageId: item.messageId,
          subject: item.subject,
          type: item.type,
          dueAt: item.dueAt,
          dueDateLabel: item.dueDateLabel,
          evidence: item.evidence,
          timeZone: clientTimeZone,
        }),
      });
      if (!asRecord(response.result) || typeof response.result.eventId !== "string") {
        throw new Error("Invalid /api/mail/calendar/sync response shape");
      }

      setCalendarEventsByKey((previous) => ({
        ...previous,
        [key]: {
          eventId: response.result.eventId,
          eventWebLink: response.result.eventWebLink,
        },
      }));
    } catch (error) {
      if (isRoutingFailFastError(error)) {
        resetDashboardForNoData("当前数据源未通过 Fail-fast 校验，请重新 verify 后再同步日历。");
        return;
      }
      if (handleUnauthorizedError(error)) {
        return;
      }
      setDashboardError(userFacingErrorMessage(error));
    } finally {
      setCalendarBusyByKey((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  }

  async function onUndoCalendar(item: MailInsightItem, eventId: string) {
    const key = buildCalendarKey(item);
    setCalendarBusyByKey((previous) => ({ ...previous, [key]: true }));

    try {
      await fetchJson<CalendarDeleteEnvelope>("/api/mail/calendar/delete", {
        method: "POST",
        body: JSON.stringify({
          sourceId: activeSourceId,
          eventId,
        }),
      });

      setCalendarEventsByKey((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      setDashboardError(userFacingErrorMessage(error));
    } finally {
      setCalendarBusyByKey((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  }

  function onViewMailDetail(item: TriageMailItem) {
    const safeLink = sanitizeExternalLink(item.webLink);
    if (safeLink) {
      window.open(safeLink, "_blank", "noopener,noreferrer");
      return;
    }

    const viewerUrl = new URL("/mailbox-viewer.html", window.location.origin).toString();
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  }

  const sourceById = useMemo(() => {
    const map = new Map<string, MailSourceProfile>();
    for (const source of sources) {
      map.set(source.id, source);
    }
    return map;
  }, [sources]);

  const activeSource = sourceById.get(activeSourceId) ?? null;

  const statsRows = useMemo(() => {
    const total = Math.max(1, Object.values(counts).reduce((sum, value) => sum + value, 0));
    return (Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => {
      const value = counts[key] ?? 0;
      const ratio = (value / total) * 100;
      return {
        key,
        value,
        ratio,
        meta: quadrantMeta[key],
        label: quadrantLabels[key],
      };
    });
  }, [counts, quadrantLabels]);

  if (authChecking) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center px-4 text-zinc-600">
        <div className="rounded-2xl border border-white/70 bg-white/85 px-5 py-3 text-sm backdrop-blur">
          {uiCopy.checkingSession}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const isLoginMode = authMode === "login";
    return (
      <div className="app-bg min-h-screen px-4 py-12 sm:px-6">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_24px_56px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{authCopy.brand}</p>
            <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => onSelectAuthLocale("zh")}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  authLocale === "zh" ? "bg-zinc-900 text-white" : "text-zinc-600"
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => onSelectAuthLocale("en")}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  authLocale === "en" ? "bg-zinc-900 text-white" : "text-zinc-600"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onSelectAuthLocale("ja")}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  authLocale === "ja" ? "bg-zinc-900 text-white" : "text-zinc-600"
                }`}
              >
                JA
              </button>
            </div>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            {isLoginMode ? authCopy.titleLogin : authCopy.titleRegister}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">{isLoginMode ? authCopy.subtitleLogin : authCopy.subtitleRegister}</p>

          {authSessionProbeError ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p>{authSessionProbeError}</p>
              <button
                type="button"
                onClick={() => void bootstrapSession()}
                className="mt-2 inline-flex rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:border-amber-500"
              >
                {authLocale === "zh" ? "重试会话检查" : "Retry session check"}
              </button>
            </div>
          ) : null}

          <form className="mt-6 space-y-3" onSubmit={isLoginMode ? onLogin : onRegister}>
            <div className="space-y-1">
              <input
                type="email"
                className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                placeholder={authCopy.emailLabel}
                aria-label={authCopy.emailLabel}
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                autoComplete={isLoginMode ? "username" : "email"}
              />
              {authFieldErrors.email ? <p className="text-[11px] text-red-600">{authFieldErrors.email}</p> : null}
            </div>

            {!isLoginMode ? (
              <div className="space-y-1">
                <input
                  type="text"
                  className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                  placeholder={authCopy.usernameLabel}
                  aria-label={authCopy.usernameLabel}
                  value={registerName}
                  onChange={(event) => setRegisterName(event.target.value)}
                  autoComplete="nickname"
                />
                {authFieldErrors.username ? <p className="text-[11px] text-red-600">{authFieldErrors.username}</p> : null}
              </div>
            ) : null}

            <div className="space-y-1">
              <input
                type="password"
                className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                placeholder={authCopy.passwordLabel}
                aria-label={authCopy.passwordLabel}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                autoComplete={isLoginMode ? "current-password" : "new-password"}
              />
              {authFieldErrors.password ? <p className="text-[11px] text-red-600">{authFieldErrors.password}</p> : null}
            </div>

            {!isLoginMode ? (
              <input
                type="password"
                className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                placeholder={authCopy.confirmPasswordLabel}
                aria-label={authCopy.confirmPasswordLabel}
                value={registerConfirmPassword}
                onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            ) : null}

            {isLoginMode ? (
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={authRemember}
                  onChange={(event) => setAuthRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {authCopy.rememberLabel}
              </label>
            ) : null}

            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={authBusy}
            >
              {authBusy
                ? authLocale === "zh"
                  ? "处理中..."
                  : "Working..."
                : isLoginMode
                  ? authCopy.submitLogin
                  : authCopy.submitRegister}
            </button>
          </form>

          <p className="mt-3 text-xs text-zinc-500">{isLoginMode ? authCopy.loginHint : authCopy.registerHint}</p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:underline"
            onClick={() => {
              setAuthMode((previous) => (previous === "login" ? "register" : "login"));
              setAuthError(null);
              setAuthFieldErrors({});
              setAuthPassword("");
              setRegisterConfirmPassword("");
            }}
          >
            {isLoginMode ? authCopy.switchToRegister : authCopy.switchToLogin}
          </button>

          {authError ? <p className="mt-3 text-xs text-red-600">{authError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen text-zinc-900">
      <div className="mx-auto w-full max-w-[1320px] px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10">
        <header className="glass-panel sticky top-3 z-30 rounded-2xl px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">True Sight Mail Ops</p>
              <p className="truncate text-sm font-medium text-zinc-900">
                {authLocale === "zh" ? "当前邮箱：" : "Mailbox: "}
                {connectedMailbox || uiCopy.unboundMailbox}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {authLocale === "zh" ? "当前账号：" : "Account: "}
                {currentUser?.displayName || currentUser?.email || uiCopy.unknownAccount}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => onSelectAuthLocale("zh")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    authLocale === "zh" ? "bg-zinc-900 text-white" : "text-zinc-600"
                  }`}
                >
                  中文
                </button>
                <button
                  type="button"
                  onClick={() => onSelectAuthLocale("en")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    authLocale === "en" ? "bg-zinc-900 text-white" : "text-zinc-600"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onSelectAuthLocale("ja")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    authLocale === "ja" ? "bg-zinc-900 text-white" : "text-zinc-600"
                  }`}
                >
                  JA
                </button>
              </div>

              <button
                type="button"
                onClick={onLaunchOutlookWindow}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                disabled={outlookBusy}
              >
                {outlookBusy ? uiCopy.authorizing : uiCopy.loginOutlook}
              </button>

              <button
                type="button"
                onClick={() => void refreshDashboard()}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                disabled={dashboardLoading}
              >
                <RefreshIcon />
                {uiCopy.refresh}
              </button>

              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-600 transition hover:text-zinc-900"
                disabled={authBusy}
              >
                {uiCopy.logout}
              </button>
            </div>
          </div>

          {(outlookInfo || outlookError || connectedAccountId || outlookRedirectUrl) && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
              {connectedAccountId ? (
                <p className="text-zinc-600">
                  Composio Account ID: <span className="font-mono text-zinc-900">{connectedAccountId}</span>
                </p>
              ) : null}
              {outlookInfo ? <p className="text-zinc-600">{outlookInfo}</p> : null}
              {outlookError ? <p className="text-red-600">{outlookError}</p> : null}
              {outlookRedirectUrl ? (
                <a href={outlookRedirectUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  <LinkIcon />
                  {uiCopy.openAuthPage}
                </a>
              ) : null}
            </div>
          )}
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside className="glass-panel hidden rounded-2xl p-3 lg:block">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{uiCopy.nav}</p>
            <div className="mt-3 space-y-1.5">
              {viewItems.map((item) => {
                const active = view === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setView(item.key)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium ring-1 transition ${statusBadgeClass(active)}`}
                  >
                    {viewLabels[item.key].label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white/80 p-3 text-xs">
              <p className="font-medium text-zinc-900">{uiCopy.currentSource}</p>
              <p className="mt-1 font-mono text-zinc-600">{activeSourceId}</p>
              <p className="mt-2 text-zinc-600">状态：{activeSource?.ready ? "ready" : "pending"}</p>
              {activeSource?.routingStatus?.message ? (
                <p className="mt-1 leading-relaxed text-zinc-500">{activeSource.routingStatus.message}</p>
              ) : null}
            </div>
          </aside>

          <main className="glass-panel rounded-2xl p-4 sm:p-5">
            {dashboardError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{dashboardError}</div>
            ) : null}

            {dashboardLoading ? (
              <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-5 text-sm text-zinc-600">{uiCopy.syncingMailData}</div>
            ) : null}

            {view === "inbox" ? (
              <div className="space-y-6">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{uiCopy.inboxOverview}</h2>
                    <p className="text-xs text-zinc-500">{formatGeneratedAt(triage?.generatedAt)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => (
                      <div key={key} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                        <p className="text-[11px] text-zinc-500">{quadrantLabels[key]}</p>
                        <p className={`text-xl font-semibold ${quadrantMeta[key].tone}`}>{counts[key]}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">{uiCopy.priorityNow}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700 ring-1 ring-red-200">
                        <BellIcon />
                        {urgentItems.length}
                      </span>
                    </div>

                    <ul className="space-y-2">
                      {(urgentItems.length > 0 ? urgentItems : importantItems).slice(0, 6).map((item) => (
                        <li key={item.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-900">{item.subject}</p>
                              <p className="truncate text-xs text-zinc-500">{item.fromName || item.fromAddress}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.aiSummary || item.bodyPreview || uiCopy.noSummary}</p>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                              onClick={() => onViewMailDetail(item)}
                            >
                              {uiCopy.viewDetail}
                            </button>
                          </div>
                        </li>
                      ))}
                      {urgentItems.length === 0 && importantItems.length === 0 ? (
                        <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-xs text-zinc-500">{uiCopy.noMailToShow}</li>
                      ) : null}
                    </ul>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">{uiCopy.upcomingSchedule}</h3>
                      <span className="text-[11px] text-zinc-500">
                        {upcomingItems.length} {authLocale === "zh" ? "项" : "items"}
                      </span>
                    </div>

                    <ul className="space-y-2">
                      {upcomingItems.slice(0, 6).map((item) => (
                        <li key={buildCalendarKey(item)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-900">{item.subject}</p>
                              <p className="mt-1 text-xs text-zinc-500">{item.dueDateLabel || formatDue(item.dueAt)}</p>
                              {item.aiSummary ? <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.aiSummary}</p> : null}
                            </div>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-700">
                              {item.type}
                            </span>
                          </div>
                        </li>
                      ))}
                      {upcomingItems.length === 0 ? (
                        <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-xs text-zinc-500">{uiCopy.noUpcomingItems}</li>
                      ) : null}
                    </ul>
                  </div>
                </section>
              </div>
            ) : null}

            {view === "stats" ? (
              <div className="space-y-6">
                <section>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-900">分类统计</h2>
                  <p className="mt-1 text-xs text-zinc-500">基于最近邮件的四象限分布与收件趋势。</p>
                  <div className="mt-4 space-y-3">
                    {statsRows.map((row) => (
                      <div key={row.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={row.meta.tone}>{row.label}</span>
                          <span className="font-mono text-zinc-600">{row.value}</span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-200/70">
                          <div className="h-2 rounded-full bg-zinc-900 transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, row.ratio))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-white p-3">
                    <p className="text-sm font-semibold text-zinc-900">高频发件人</p>
                    <ul className="mt-3 space-y-2">
                      {topSenders.map((sender) => (
                        <li key={sender.name} className="flex items-center justify-between text-sm text-zinc-700">
                          <span className="truncate">{sender.name}</span>
                          <span className="font-mono text-xs text-zinc-500">{sender.count}</span>
                        </li>
                      ))}
                      {topSenders.length === 0 ? <li className="text-xs text-zinc-500">暂无统计样本。</li> : null}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-3">
                    <p className="text-sm font-semibold text-zinc-900">运行指标</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-zinc-500">总邮件</dt>
                        <dd className="font-mono text-zinc-900">{triage?.total ?? 0}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-zinc-500">未读</dt>
                        <dd className="font-mono text-zinc-900">{unreadCount}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-zinc-500">未来事项</dt>
                        <dd className="font-mono text-zinc-900">{upcomingItems.length}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-zinc-500">明日 DDL</dt>
                        <dd className="font-mono text-zinc-900">{insights?.tomorrowDdl?.length ?? 0}</dd>
                      </div>
                    </dl>
                  </div>
                </section>
              </div>
            ) : null}

            {view === "calendar" ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-900">日历事项</h2>
                  <p className="mt-1 text-xs text-zinc-500">从邮件识别出的会议、DDL、考试与事件，可直接写入 Outlook 日历。</p>
                </div>

                <ul className="space-y-2">
                  {upcomingItems.map((item) => {
                    const key = buildCalendarKey(item);
                    const busy = Boolean(calendarBusyByKey[key]);
                    const synced = calendarEventsByKey[key] ?? null;
                    const eventLink = sanitizeExternalLink(synced?.eventWebLink);

                    return (
                      <li key={key} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900">{item.subject}</p>
                            <p className="mt-1 text-xs text-zinc-500">{item.dueDateLabel || formatDue(item.dueAt)}</p>
                            {item.aiSummary ? <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.aiSummary}</p> : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-700">{item.type}</span>

                            {!synced ? (
                              <button
                                type="button"
                                onClick={() => void onSyncCalendar(item)}
                                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                                disabled={busy}
                              >
                                {busy ? "写入中..." : "写入日历"}
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void onUndoCalendar(item, synced.eventId)}
                                  className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                                  disabled={busy}
                                >
                                  {busy ? "处理中..." : "撤销"}
                                </button>
                                {eventLink ? (
                                  <a
                                    href={eventLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                                  >
                                    <LinkIcon />
                                    打开事件
                                  </a>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}

                  {upcomingItems.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-xs text-zinc-500">
                      暂无可同步事项。
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {view === "settings" ? (
              <div className="space-y-6">
                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">Outlook 授权</h2>
                      <p className="mt-1 text-xs text-zinc-500">点击按钮后会打开 Composio 授权窗口，完成登录后返回本页刷新。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onLaunchOutlookWindow}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
                        disabled={outlookBusy}
                      >
                        {outlookBusy ? "授权中..." : "登录 Outlook"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onAutoConnectSource()}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                        disabled={sourcesBusy}
                      >
                        自动添加当前账号
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900">邮件数据源</h3>
                    <button
                      type="button"
                      onClick={() => void onReloadSources()}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                      disabled={sourcesBusy}
                    >
                      刷新快照
                    </button>
                  </div>

                  <div className="space-y-2">
                    {sources.map((source) => {
                      const isActive = source.id === activeSourceId;
                      const badgeClass = source.ready
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200";

                      return (
                        <div key={source.id} className="rounded-xl border border-zinc-200 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900">{source.name}</p>
                              <p className="truncate font-mono text-[11px] text-zinc-500">{source.id}</p>
                              <p className="mt-1 text-xs text-zinc-600">
                                mailbox: {source.mailboxUserId || source.emailHint || "(none)"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${badgeClass}`}>
                                {source.ready ? "ready" : "pending"}
                              </span>
                              {isActive ? (
                                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-white">active</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {!isActive ? (
                              <button
                                type="button"
                                onClick={() => void onSelectSource(source.id)}
                                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                                disabled={sourcesBusy}
                              >
                                设为 active
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => void onVerifySource(source.id)}
                              className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                              disabled={sourcesBusy}
                            >
                              verify
                            </button>

                            {source.id !== "default_outlook" ? (
                              <button
                                type="button"
                                onClick={() => void onDeleteSource(source.id)}
                                className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                disabled={sourcesBusy}
                              >
                                删除
                              </button>
                            ) : null}
                          </div>

                          {source.routingStatus?.message ? (
                            <p className="mt-2 text-xs text-zinc-500">{source.routingStatus.message}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-zinc-900">手动添加数据源</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    适用于多账号场景：填写 Outlook 的 mailboxUserId 与 Composio connectedAccountId（`ca_...`）。
                  </p>

                  <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={onCreateSource}>
                    <input
                      type="text"
                      value={newSourceLabel}
                      onChange={(event) => setNewSourceLabel(event.target.value)}
                      placeholder="数据源标签，如：School Outlook"
                      className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
                    />
                    <input
                      type="text"
                      value={newMailboxUserId}
                      onChange={(event) => setNewMailboxUserId(event.target.value)}
                      placeholder="Mailbox User ID（邮箱或 me）"
                      className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
                    />
                    <input
                      type="text"
                      value={newConnectedAccountId}
                      onChange={(event) => setNewConnectedAccountId(event.target.value)}
                      placeholder="Composio Account ID（ca_...）"
                      className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900 md:col-span-2"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 md:col-span-2"
                      disabled={sourcesBusy}
                    >
                      {sourcesBusy ? "处理中..." : "创建并验证"}
                    </button>
                  </form>
                </section>

                {sourceInfo ? <p className="text-xs text-emerald-700">{sourceInfo}</p> : null}
                {sourceError ? <p className="text-xs text-red-600">{sourceError}</p> : null}
              </div>
            ) : null}
          </main>

          <aside className="glass-panel hidden rounded-2xl p-4 lg:block">
            <div className="mb-4">
              <p className="text-sm font-semibold text-zinc-900">邮件问答</p>
              <p className="mt-1 text-xs text-zinc-500">例如：明天有哪些 DDL？未来 7 天有哪些会议？</p>
            </div>

            <form className="space-y-2" onSubmit={onAskAgent}>
              <textarea
                value={agentInput}
                onChange={(event) => setAgentInput(event.target.value)}
                placeholder="输入问题..."
                className="h-24 w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                maxLength={300}
              />
              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
                disabled={agentBusy}
              >
                <SendIcon />
                {agentBusy ? "分析中..." : "发送问题"}
              </button>
            </form>

            {agentAnswer ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">{agentAnswer}</div>
            ) : null}
            {agentError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{agentError}</div>
            ) : null}

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
              <p>
                {authLocale === "zh" ? "当前源：" : "Source: "}
                <span className="font-mono text-zinc-900">{activeSourceId}</span>
              </p>
              <p className="mt-1">{authLocale === "zh" ? "时区：" : "Time zone: "}{insights?.timeZone || clientTimeZone}</p>
            </div>
          </aside>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-2xl border border-white/70 bg-white/92 p-1 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur lg:hidden">
        {viewItems.map((item) => {
          const active = view === item.key;
          const icon =
            item.key === "inbox" ? (
              <HomeIcon />
            ) : item.key === "stats" ? (
              <ChartIcon />
            ) : item.key === "calendar" ? (
              <CalendarIcon />
            ) : (
              <SettingsIcon />
            );

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={`inline-flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl py-2 text-[11px] font-medium transition ${
                active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {icon}
              <span className="mt-0.5 truncate">{viewLabels[item.key].short}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
