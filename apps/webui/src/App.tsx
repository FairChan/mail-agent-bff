import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type MailQuadrant =
  | "urgent_important"
  | "not_urgent_important"
  | "urgent_not_important"
  | "not_urgent_not_important";

type TriageMailItem = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  webLink: string;
  aiSummary?: string;
};

type MailTriageResult = {
  generatedAt: string;
  total: number;
  counts: Record<MailQuadrant, number>;
  quadrants: Record<MailQuadrant, TriageMailItem[]>;
};

type MailInsightItem = {
  messageId: string;
  subject: string;
  dueAt: string;
  dueDateLabel: string;
  aiSummary?: string;
};

type MailInsightsResult = {
  upcoming: MailInsightItem[];
};

type MailSourceProfile = {
  id: string;
  name: string;
  emailHint?: string;
  mailboxUserId?: string;
  enabled: boolean;
  ready: boolean;
};

type MailSourcesEnvelope = {
  ok: boolean;
  result: {
    sources: MailSourceProfile[];
    activeSourceId: string;
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

type DashboardDeadline = {
  key: string;
  title: string;
  tag: string;
};

type DashboardMailItem = {
  key: string;
  levelLabel: string;
  from: string;
  subject: string;
  summary?: string;
  webLink?: string;
  highlight: boolean;
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

function userFacingErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "OUTLOOK_CONNECTION_REQUIRED") {
    return "请先点击“登录 Outlook”完成授权，然后返回此页重试。";
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

function daysUntil(iso: string): number | null {
  const due = Date.parse(iso);
  if (Number.isNaN(due)) {
    return null;
  }
  const now = Date.now();
  const diff = due - now;
  if (diff <= 0) {
    return 0;
  }
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
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

function iconClass(active: boolean): string {
  return active ? "text-blue-600" : "text-zinc-500";
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18h5l-1.4-1.4A2 2 0 0 1 18 15.2V11a6 6 0 1 0-12 0v4.2a2 2 0 0 1-.6 1.4L4 18h5" />
      <path d="M9 18a3 3 0 0 0 6 0" />
    </svg>
  );
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

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11.5 21 3l-8.5 18-1.8-7.7L3 11.5Z" />
    </svg>
  );
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeSourceId, setActiveSourceId] = useState("default_outlook");
  const [connectedMailbox, setConnectedMailbox] = useState("ssemasterpro@outlook.com");
  const [triage, setTriage] = useState<MailTriageResult | null>(null);
  const [insights, setInsights] = useState<MailInsightsResult | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  const [outlookBusy, setOutlookBusy] = useState(false);
  const [outlookInfo, setOutlookInfo] = useState<string | null>(null);
  const [outlookError, setOutlookError] = useState<string | null>(null);
  const [outlookRedirectUrl, setOutlookRedirectUrl] = useState<string | null>(null);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const dashboardRequestSeqRef = useRef(0);
  const outlookRequestSeqRef = useRef(0);
  const focusRefreshCleanupRef = useRef<(() => void) | null>(null);

  const counts = useMemo(
    () =>
      triage?.counts ?? {
        urgent_important: 1,
        not_urgent_important: 1,
        urgent_not_important: 0,
        not_urgent_not_important: 0,
      },
    [triage]
  );

  const urgentItem = useMemo<DashboardMailItem>(() => {
    const item = triage?.quadrants.urgent_important?.[0];
    return {
      key: item?.id ?? "fallback_urgent",
      levelLabel: "紧急重要",
      from: item?.fromName ?? "教务处",
      subject: item?.subject ?? "期末考试安排",
      summary: item?.aiSummary ?? "正在生成摘要...",
      webLink: item?.webLink,
      highlight: true,
    };
  }, [triage]);

  const secondaryItem = useMemo<DashboardMailItem>(() => {
    const item = triage?.quadrants.not_urgent_important?.[0];
    return {
      key: item?.id ?? "fallback_secondary",
      levelLabel: "不紧急重要",
      from: item?.fromName ?? "学生会",
      subject: item?.subject ?? "活动报名",
      summary: item?.aiSummary ?? "正在生成摘要...",
      webLink: item?.webLink,
      highlight: false,
    };
  }, [triage]);

  const deadlines = useMemo<DashboardDeadline[]>(() => {
    const dynamic = (insights?.upcoming ?? []).slice(0, 2).map((item, index) => {
      const day = daysUntil(item.dueAt);
      const tag = day === null ? item.dueDateLabel : `${day}天后`;
      return {
        key: item.messageId || `dynamic_${index}`,
        title: item.subject,
        tag,
      };
    });

    if (dynamic.length >= 2) {
      return dynamic;
    }

    return [
      { key: "fallback_deadline_1", title: "项目报告截止", tag: "2天后" },
      { key: "fallback_deadline_2", title: "会议安排", tag: "5天后" },
    ];
  }, [insights]);

  const urgentNoticeCount = counts.urgent_important;

  async function loadSourcesAndMailbox(): Promise<{
    sourceId: string;
    mailbox: string;
    hasReadySource: boolean;
  }> {
    const sourceResponse = await fetchJson<MailSourcesEnvelope>("/api/mail/sources");
    const nextSourceId = sourceResponse.result.activeSourceId || "default_outlook";
    const readySources = sourceResponse.result.sources.filter((item) => item.enabled && item.ready);
    const activeSource =
      sourceResponse.result.sources.find((item) => item.id === nextSourceId && item.enabled && item.ready) ??
      sourceResponse.result.sources.find((item) => item.id === "default_outlook" && item.enabled && item.ready) ??
      readySources[0] ??
      sourceResponse.result.sources.find((item) => item.id === nextSourceId && item.enabled) ??
      sourceResponse.result.sources.find((item) => item.enabled) ??
      sourceResponse.result.sources[0];
    const resolvedSourceId = activeSource?.id ?? "default_outlook";
    const hasReadySource = Boolean(activeSource?.enabled && activeSource?.ready);

    const mailbox =
      activeSource?.mailboxUserId?.trim() ||
      activeSource?.emailHint?.trim() ||
      connectedMailbox;

    return {
      sourceId: resolvedSourceId,
      mailbox: mailbox || "ssemasterpro@outlook.com",
      hasReadySource,
    };
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

    return {
      triage: triageResponse.result,
      insights: insightResponse.result,
    };
  }

  function isRoutingFailFastError(error: unknown): boolean {
    if (!(error instanceof HttpError) || error.status !== 412) {
      return false;
    }

    const payload = error.payload;
    if (payload && typeof payload === "object" && "errorCode" in payload) {
      const code = String((payload as { errorCode?: unknown }).errorCode ?? "");
      return code.startsWith("MAIL_SOURCE_");
    }

    return true;
  }

  async function refreshDashboard() {
    const requestSeq = ++dashboardRequestSeqRef.current;
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const source = await loadSourcesAndMailbox();
      if (requestSeq !== dashboardRequestSeqRef.current) {
        return;
      }

      setActiveSourceId(source.sourceId);
      setConnectedMailbox(source.mailbox);

      if (!source.hasReadySource) {
        setTriage(null);
        setInsights(null);
        setDashboardError("当前没有已验证可用的数据源，请先完成 Outlook 授权并验证数据源。");
        return;
      }

      try {
        const data = await loadDashboardBySource(source.sourceId);
        if (requestSeq !== dashboardRequestSeqRef.current) {
          return;
        }
        setTriage(data.triage);
        setInsights(data.insights);
      } catch (error) {
        if (isRoutingFailFastError(error)) {
          const fallback = await loadSourcesAndMailbox();
          if (requestSeq !== dashboardRequestSeqRef.current) {
            return;
          }

          setActiveSourceId(fallback.sourceId);
          setConnectedMailbox(fallback.mailbox);

          if (fallback.hasReadySource && fallback.sourceId !== source.sourceId) {
            setTriage(null);
            setInsights(null);
            const fallbackData = await loadDashboardBySource(fallback.sourceId);
            if (requestSeq !== dashboardRequestSeqRef.current) {
              return;
            }
            setTriage(fallbackData.triage);
            setInsights(fallbackData.insights);
            setDashboardError("当前数据源未就绪，已自动切换到可用数据源。");
            return;
          }

          setTriage(null);
          setInsights(null);
          setDashboardError("当前数据源未通过校验，请在“邮件数据源”完成 verify 后重试。");
          return;
        }

        throw error;
      }
    } catch (error) {
      if (requestSeq !== dashboardRequestSeqRef.current) {
        return;
      }
      if (error instanceof HttpError && error.status === 401) {
        setIsAuthenticated(false);
        setDashboardError(null);
        setTriage(null);
        setInsights(null);
      } else {
        setDashboardError(userFacingErrorMessage(error));
      }
    } finally {
      if (requestSeq === dashboardRequestSeqRef.current) {
        setDashboardLoading(false);
      }
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await fetchJson<{ ok: boolean; agentId: string; allowedTools: string[] }>("/api/meta");
        setIsAuthenticated(true);
        await refreshDashboard();
      } catch (error) {
        setIsAuthenticated(false);
        if (!(error instanceof HttpError && error.status === 401)) {
          setAuthError(errorMessage(error));
        }
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (focusRefreshCleanupRef.current) {
        focusRefreshCleanupRef.current();
        focusRefreshCleanupRef.current = null;
      }
    };
  }, []);

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
      setTriage(null);
      setInsights(null);
      setDashboardError(null);
      await refreshDashboard();
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
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
    setActiveSourceId("default_outlook");
    setConnectedMailbox("ssemasterpro@outlook.com");
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
  }

  function registerRefreshOnFocus() {
    if (focusRefreshCleanupRef.current) {
      focusRefreshCleanupRef.current();
      focusRefreshCleanupRef.current = null;
    }

    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      focusRefreshCleanupRef.current = null;
      void refreshDashboard();
    };
    window.addEventListener("focus", onFocus, { once: true });
    focusRefreshCleanupRef.current = () => {
      window.removeEventListener("focus", onFocus);
    };
  }

  function openOutlookAuthPopup(initialUrl = "about:blank"): Window | null {
    const popup = window.open(initialUrl, "composio_outlook_auth", "popup=yes,width=520,height=760");
    if (popup) {
      try {
        popup.opener = null;
      } catch {
        try {
          popup.close();
        } catch {
          // Ignore close failures and fallback to link mode.
        }
        return null;
      }
    }
    return popup;
  }

  async function onLaunchOutlookWindow() {
    if (!isAuthenticated || outlookBusy) {
      return;
    }

    const popup = openOutlookAuthPopup();
    const popupUnavailableMessage = "浏览器未自动打开授权弹窗，请点击下方“打开授权页”链接完成 Outlook 登录。";

    const requestSeq = ++outlookRequestSeqRef.current;
    const isStale = () => requestSeq !== outlookRequestSeqRef.current;

    setOutlookBusy(true);
    setOutlookError(null);
    setOutlookInfo(null);
    setOutlookRedirectUrl(null);
    setConnectedAccountId(null);

    try {
      const response = await fetchJson<OutlookLaunchEnvelope>("/api/mail/connections/outlook/launch-auth", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (isStale()) {
        if (popup && !popup.closed) {
          popup.close();
        }
        return;
      }

      const safeRedirectUrl = sanitizeOutlookAuthLink(response.result.redirectUrl);
      setConnectedAccountId(response.result.connectedAccountId);

      if (response.result.hasActiveConnection || response.result.status === "active") {
        setOutlookRedirectUrl(null);
        if (popup && !popup.closed) {
          popup.close();
        }
        setOutlookInfo(response.result.message ?? "Outlook 已连接，无需重复授权。");
        void refreshDashboard();
        return;
      }

      setOutlookRedirectUrl(safeRedirectUrl);

      if (!safeRedirectUrl) {
        if (popup && !popup.closed) {
          popup.close();
        }
        if (response.result.sessionInstructions) {
          setOutlookInfo(`授权已发起：${response.result.sessionInstructions}`);
          return;
        }
        setOutlookError("授权已发起，但未返回有效授权地址。");
        return;
      }

      const reusablePopup = popup && !popup.closed ? popup : openOutlookAuthPopup();
      if (reusablePopup) {
        reusablePopup.location.replace(safeRedirectUrl);
        reusablePopup.focus();
        setOutlookInfo("已打开 Composio 授权窗口，请完成 Outlook 登录。");
        registerRefreshOnFocus();
      } else {
        setOutlookInfo(popupUnavailableMessage);
      }
    } catch (error) {
      if (isStale()) {
        if (popup && !popup.closed) {
          popup.close();
        }
        return;
      }

      const payload = error instanceof HttpError ? error.payload : null;
      const fallbackRedirect = sanitizeOutlookAuthLink(readOptionalStringField(payload, "redirectUrl"));
      const serverErrorCode = readOptionalStringField(payload, "errorCode");
      const sessionInstructions = readOptionalStringField(payload, "sessionInstructions");
      let redirected = false;

      if (fallbackRedirect) {
        setOutlookRedirectUrl(fallbackRedirect);
        try {
          const reusablePopup = popup && !popup.closed ? popup : openOutlookAuthPopup();
          if (reusablePopup) {
            reusablePopup.location.replace(fallbackRedirect);
            reusablePopup.focus();
            redirected = true;
            setOutlookInfo("自动授权接口返回异常，已打开 Composio 页面，请继续完成 Outlook 授权。");
            registerRefreshOnFocus();
          }
        } catch {
          redirected = false;
        }
      }

      if (!redirected) {
        if (popup && !popup.closed) {
          popup.close();
        }
      }

      if (sessionInstructions) {
        setOutlookInfo((previous) => (previous ? `${previous} ${sessionInstructions}` : sessionInstructions));
      }

      if (serverErrorCode === "COMPOSIO_CONSUMER_KEY_INVALID") {
        const advisory = "Composio Consumer Key 无效，请先在服务器更新 consumerKey（ck_...）。";
        if (redirected) {
          setOutlookInfo((previous) => (previous ? `${previous} ${advisory}` : advisory));
        } else {
          setOutlookError(advisory);
        }
      } else if (!redirected) {
        if (fallbackRedirect) {
          setOutlookInfo((previous) => (previous ? `${previous} ${popupUnavailableMessage}` : popupUnavailableMessage));
        } else {
          setOutlookError(userFacingErrorMessage(error));
        }
      }
    } finally {
      if (!isStale()) {
        setOutlookBusy(false);
      }
    }
  }

  function onViewMailDetail(item: DashboardMailItem) {
    const safeLink = sanitizeExternalLink(item.webLink);
    if (safeLink) {
      window.open(safeLink, "_blank", "noopener,noreferrer");
      return;
    }

    const viewerUrl = new URL("/mailbox-viewer.html", window.location.origin).toString();
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
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
      setAgentAnswer(response.result.answer);
    } catch (error) {
      setAgentError(userFacingErrorMessage(error));
    } finally {
      setAgentBusy(false);
    }
  }

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-zinc-600">
        正在加载邮箱仪表盘...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-12">
        <div className="mx-auto w-full max-w-sm border border-zinc-200 bg-white p-5">
          <h1 className="text-base font-semibold tracking-tight text-zinc-900">邮箱 AI Agent 登录</h1>
          <p className="mt-1 text-xs text-zinc-500">输入 BFF API Key 进入仪表盘</p>
          <form className="mt-4 space-y-3" onSubmit={onLogin}>
            <input
              type="password"
              className="w-full border border-zinc-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-600"
              placeholder="BFF API Key"
              aria-label="BFF API Key"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              autoComplete="current-password"
            />
            <button
              type="submit"
              className="w-full border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              disabled={authBusy}
            >
              {authBusy ? "登录中..." : "进入仪表盘"}
            </button>
          </form>
          {authError ? <p className="mt-3 text-xs text-red-600">{authError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col border-x border-zinc-200 bg-white">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Email AI Agent</p>
              <p className="truncate text-sm font-medium text-zinc-900">当前接入邮箱：{connectedMailbox}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLaunchOutlookWindow}
                className="border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
                disabled={outlookBusy}
              >
                {outlookBusy ? "授权中..." : "登录 Outlook"}
              </button>
              <button
                type="button"
                onClick={() => void refreshDashboard()}
                className="border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
                disabled={dashboardLoading}
              >
                刷新
              </button>
              <button
                type="button"
                className="relative inline-flex h-8 w-8 items-center justify-center border border-zinc-300 text-zinc-700"
                aria-label="通知"
              >
                <BellIcon />
                {urgentNoticeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {urgentNoticeCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void onLogout()}
                className="border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                退出
              </button>
            </div>
          </div>
          {(outlookInfo || outlookError || connectedAccountId) && (
            <div className="border-t border-zinc-200 px-4 py-2 text-xs sm:px-6">
              {connectedAccountId ? (
                <p className="text-zinc-600">
                  Composio Account ID: <span className="font-mono text-zinc-900">{connectedAccountId}</span>
                </p>
              ) : null}
              {outlookInfo ? <p className="text-zinc-600">{outlookInfo}</p> : null}
              {outlookError ? <p className="text-red-600">{outlookError}</p> : null}
              {outlookRedirectUrl ? (
                <a href={outlookRedirectUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  打开授权页
                </a>
              ) : null}
            </div>
          )}
        </header>

        <main className="flex-1 divide-y divide-zinc-200 px-4 pb-36 pt-3 sm:px-6">
          <section className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-700">邮件分类统计</h2>
              <p className="text-xs text-zinc-500">{formatGeneratedAt(triage?.generatedAt)}</p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <div className="border-b border-zinc-200 pb-2">
                <p className="text-[11px] text-zinc-500">紧急重要</p>
                <p className="text-lg font-semibold text-red-600">{counts.urgent_important}</p>
              </div>
              <div className="border-b border-zinc-200 pb-2">
                <p className="text-[11px] text-zinc-500">不紧急重要</p>
                <p className="text-lg font-semibold text-zinc-900">{counts.not_urgent_important}</p>
              </div>
              <div className="border-b border-zinc-200 pb-2">
                <p className="text-[11px] text-zinc-500">紧急不重要</p>
                <p className="text-lg font-semibold text-zinc-900">{counts.urgent_not_important}</p>
              </div>
              <div className="border-b border-zinc-200 pb-2">
                <p className="text-[11px] text-zinc-500">不紧急不重要</p>
                <p className="text-lg font-semibold text-zinc-900">{counts.not_urgent_not_important}</p>
              </div>
            </div>

            <div className="mt-4 divide-y divide-zinc-200 border border-zinc-200">
              {[urgentItem, secondaryItem].map((item, index) => (
                <article
                  key={item.key}
                  className="stagger-fade flex items-center justify-between gap-3 px-3 py-3 hover:bg-zinc-50"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${item.highlight ? "text-red-600" : "text-zinc-700"}`}>
                      {item.levelLabel}
                    </p>
                    <p className="truncate text-xs text-zinc-600">来自：{item.from}</p>
                    <p className="truncate text-sm font-medium text-zinc-900">主题：{item.subject}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.summary ?? "正在生成摘要..."}</p>
                  </div>

                  {item.highlight ? (
                    <button
                      type="button"
                      className="shrink-0 border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-zinc-50"
                      onClick={() => onViewMailDetail(item)}
                    >
                      查看详情
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-700">即将到来的截止日期</h2>
              <span className="text-xs text-zinc-500">List</span>
            </div>

            <ul className="divide-y divide-zinc-200 border border-zinc-200">
              {deadlines.map((item, index) => (
                <li
                  key={item.key}
                  className="stagger-fade flex items-center justify-between px-3 py-3 hover:bg-zinc-50"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-900">{item.title}</p>
                    {insights?.upcoming?.[index]?.aiSummary ? (
                      <p className="mt-1 truncate text-xs text-zinc-500">{insights.upcoming[index].aiSummary}</p>
                    ) : null}
                  </div>
                  <span className="ml-3 shrink-0 border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600">
                    {item.tag}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {dashboardError ? <p className="py-3 text-xs text-red-600">{dashboardError}</p> : null}
        </main>

        <section className="pointer-events-none fixed bottom-16 left-1/2 z-20 w-full max-w-5xl -translate-x-1/2 px-4 sm:px-6">
          <form
            onSubmit={onAskAgent}
            className="pointer-events-auto border border-zinc-200 bg-white px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <input
                value={agentInput}
                onChange={(event) => setAgentInput(event.target.value)}
                placeholder="询问邮件相关问题..."
                aria-label="询问邮件相关问题"
                className="h-10 flex-1 border border-zinc-300 px-3 text-sm outline-none transition-colors duration-200 focus:border-blue-600"
                maxLength={300}
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1 border border-blue-600 bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                disabled={agentBusy}
              >
                <SendIcon />
                发送
              </button>
            </div>
            {agentAnswer ? <p className="mt-2 text-xs text-zinc-700">{agentAnswer}</p> : null}
            {agentError ? <p className="mt-2 text-xs text-red-600">{agentError}</p> : null}
          </form>
        </section>

        <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-5xl -translate-x-1/2 border-t border-zinc-200 bg-white">
          <button type="button" className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs ${iconClass(true)}`}>
            <HomeIcon />主页
          </button>
          <button type="button" className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs ${iconClass(false)}`}>
            <ChartIcon />统计
          </button>
          <button type="button" className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs ${iconClass(false)}`}>
            <CalendarIcon />日历
          </button>
          <button type="button" className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs ${iconClass(false)}`}>
            <SettingsIcon />设置
          </button>
        </nav>
      </div>
    </div>
  );
}
