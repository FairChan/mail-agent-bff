import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ViewKey = "inbox" | "stats" | "calendar" | "settings";

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

const viewItems: Array<{ key: ViewKey; label: string; short: string }> = [
  { key: "inbox", label: "收件箱", short: "主页" },
  { key: "stats", label: "统计", short: "统计" },
  { key: "calendar", label: "日历", short: "日历" },
  { key: "settings", label: "设置", short: "设置" },
];

const quadrantMeta: Record<MailQuadrant, { label: string; tone: string; badge: string }> = {
  urgent_important: {
    label: "紧急重要",
    tone: "text-red-700",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
  not_urgent_important: {
    label: "不紧急重要",
    tone: "text-blue-700",
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  urgent_not_important: {
    label: "紧急不重要",
    tone: "text-orange-700",
    badge: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  not_urgent_not_important: {
    label: "不紧急不重要",
    tone: "text-zinc-700",
    badge: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  },
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${bffBaseUrl}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
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
  return mailbox && mailbox.length > 0 ? mailbox : previousMailbox;
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
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [sources, setSources] = useState<MailSourceProfile[]>([]);
  const [activeSourceId, setActiveSourceId] = useState("default_outlook");
  const [connectedMailbox, setConnectedMailbox] = useState("未绑定邮箱");

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
  const focusRefreshCleanupRef = useRef<(() => void) | null>(null);

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
      const key = item.fromName?.trim() || item.fromAddress?.trim() || "未知发件人";
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return [...counter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [allMailItems]);

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

    try {
      const session = await fetchJson<SessionEnvelope>("/api/auth/session");
      setIsAuthenticated(session.authenticated);

      if (session.authenticated) {
        await refreshDashboard();
      }
    } catch (error) {
      setIsAuthenticated(false);
      setAuthError(errorMessage(error));
    } finally {
      setAuthChecking(false);
    }
  }

  useEffect(() => {
    void bootstrapSession();

    return () => {
      if (focusRefreshCleanupRef.current) {
        focusRefreshCleanupRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function registerRefreshOnFocus() {
    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }

    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      focusRefreshCleanupRef.current = null;
      void refreshDashboard();
      void loadSourceSnapshot().catch(() => undefined);
    };

    window.addEventListener("focus", onFocus, { once: true });
    focusRefreshCleanupRef.current = () => {
      window.removeEventListener("focus", onFocus);
    };
  }

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKeyInput.trim()) {
      setAuthError("请输入 BFF API Key");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);

    try {
      await fetchJson<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
        }),
      });
      setIsAuthenticated(true);
      setView("inbox");
      setDashboardError(null);
      setSourceError(null);
      setSourceInfo(null);
      await refreshDashboard();
    } catch (error) {
      setAuthError(userFacingErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function resetUiForUnauthorized() {
    dashboardRequestSeqRef.current += 1;
    outlookRequestSeqRef.current += 1;

    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }

    setIsAuthenticated(false);
    setAuthBusy(false);
    setSourcesBusy(false);
    setOutlookBusy(false);
    setDashboardLoading(false);
    setAgentBusy(false);

    setSources([]);
    setActiveSourceId("default_outlook");
    setConnectedMailbox("未绑定邮箱");
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
    setAuthError("会话已过期，请重新登录。");
    return true;
  }

  async function onLogout() {
    dashboardRequestSeqRef.current += 1;
    outlookRequestSeqRef.current += 1;

    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }

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
    setApiKeyInput("");
    setAuthBusy(false);
    setView("inbox");

    setSources([]);
    setActiveSourceId("default_outlook");
    setConnectedMailbox("未绑定邮箱");

    setTriage(null);
    setInsights(null);
    setDashboardError(null);

    setAgentInput("");
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
    const bridgeUrl = new URL("/outlook-auth-bridge.html", window.location.origin).toString();
    const popup = window.open(
      bridgeUrl,
      "_blank",
      "popup=yes,width=560,height=780,noopener,noreferrer"
    );
    const popupUnavailableMessage = "浏览器未自动打开授权弹窗，请点击下方“打开授权页”完成授权。";

    setOutlookBusy(true);
    setOutlookError(null);
    setOutlookInfo(null);
    setOutlookRedirectUrl(null);
    setConnectedAccountId(null);

    if (popup && !popup.closed) {
      popup.focus();
      setOutlookInfo("已打开 Composio 授权窗口，请在新窗口完成 Outlook 登录。");
      registerRefreshOnFocus();
    } else {
      setOutlookRedirectUrl(bridgeUrl);
      setOutlookInfo(popupUnavailableMessage);
      registerRefreshOnFocus();
    }

    setOutlookBusy(false);
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
      };
    });
  }, [counts]);

  if (authChecking) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center px-4 text-zinc-600">
        <div className="rounded-2xl border border-white/70 bg-white/85 px-5 py-3 text-sm backdrop-blur">
          正在检查会话状态...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-bg min-h-screen px-4 py-12 sm:px-6">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_24px_56px_rgba(15,23,42,0.10)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">True Sight</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">登录 Email AI Agent</h1>
          <p className="mt-2 text-sm text-zinc-600">输入 BFF API Key 进入工作台。</p>

          <form className="mt-6 space-y-3" onSubmit={onLogin}>
            <input
              type="password"
              className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
              placeholder="BFF API Key"
              aria-label="BFF API Key"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              autoComplete="current-password"
            />
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={authBusy}
            >
              {authBusy ? "登录中..." : "进入工作台"}
            </button>
          </form>

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
              <p className="truncate text-sm font-medium text-zinc-900">当前邮箱：{connectedMailbox}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onLaunchOutlookWindow}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                disabled={outlookBusy}
              >
                {outlookBusy ? "授权中..." : "登录 Outlook"}
              </button>

              <button
                type="button"
                onClick={() => void refreshDashboard()}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                disabled={dashboardLoading}
              >
                <RefreshIcon />
                刷新
              </button>

              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-600 transition hover:text-zinc-900"
                disabled={authBusy}
              >
                退出
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
                  打开授权页
                </a>
              ) : null}
            </div>
          )}
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside className="glass-panel hidden rounded-2xl p-3 lg:block">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">导航</p>
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
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white/80 p-3 text-xs">
              <p className="font-medium text-zinc-900">当前数据源</p>
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
              <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-5 text-sm text-zinc-600">正在同步邮件数据...</div>
            ) : null}

            {view === "inbox" ? (
              <div className="space-y-6">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-900">收件箱概览</h2>
                    <p className="text-xs text-zinc-500">{formatGeneratedAt(triage?.generatedAt)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => (
                      <div key={key} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                        <p className="text-[11px] text-zinc-500">{quadrantMeta[key].label}</p>
                        <p className={`text-xl font-semibold ${quadrantMeta[key].tone}`}>{counts[key]}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">优先处理</h3>
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
                              <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.aiSummary || item.bodyPreview || "暂无摘要"}</p>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                              onClick={() => onViewMailDetail(item)}
                            >
                              查看
                            </button>
                          </div>
                        </li>
                      ))}
                      {urgentItems.length === 0 && importantItems.length === 0 ? (
                        <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-xs text-zinc-500">暂无可展示邮件。</li>
                      ) : null}
                    </ul>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">近期日程 / DDL</h3>
                      <span className="text-[11px] text-zinc-500">{upcomingItems.length} 项</span>
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
                        <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-xs text-zinc-500">未来 7 天未识别到明确时间事项。</li>
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
                          <span className={row.meta.tone}>{row.meta.label}</span>
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
                当前源：<span className="font-mono text-zinc-900">{activeSourceId}</span>
              </p>
              <p className="mt-1">时区：{insights?.timeZone || clientTimeZone}</p>
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
              <span className="mt-0.5 truncate">{item.short}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
