import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { ThemeProvider } from "./lib/theme-context";
import { AnimatedThemeToggler } from "./components/ui/animated-theme-toggler";
import { RippleButton } from "./components/ui/ripple-button";
import { CircularProgress } from "./components/ui/circular-progress";
import { BentoCard, BentoGrid, BentoItem } from "./components/ui/bento";
import { Badge } from "./components/ui/badge";
import Dock from "./components/ui/Dock";
import { MailCardSkeleton, StatCardSkeleton, Skeleton } from "./components/ui/skeleton";
import { AnimatedList, AnimatedListItem } from "./components/ui/animated-list";
import { DotGridBackground } from "./components/backgrounds/DotGridBackground";
import { DevPanel, type DevError } from "./components/dev/DevPanel";
import { StatsPage } from "./components/pages/StatsPage";
import { CalendarPage } from "./components/pages/CalendarPage";
import { SettingsPage } from "./components/pages/SettingsPage";
import { ResizableSidebar, type Account, type AccountProvider } from "./components/sidebar/ResizableSidebar";
import { AddAccountModal } from "./components/sidebar/AddAccountModal";
import { OmniSearchBar } from "./components/omnisearch";

// ─── Types ────────────────────────────────────────────────────────────────────

type MailQuadrant = "urgent_important" | "not_urgent_important" | "urgent_not_important" | "not_urgent_not_important";

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

type MailSourcesEnvelope = { ok: boolean; result: { sources: MailSourceProfile[]; activeSourceId: string } };
type MailTriageEnvelope = { ok: boolean; sourceId: string; result: MailTriageResult };
type MailInsightsEnvelope = { ok: boolean; sourceId: string; result: MailInsightsResult };
type MailQueryEnvelope = { ok: boolean; result: { answer: string } };
type OutlookLaunchEnvelope = { ok: boolean; result: { redirectUrl: string | null; connectedAccountId: string | null; mailboxUserIdHint: string | null; sessionInstructions: string | null } };

type DashboardMailItem = {
  key: string;
  levelLabel: string;
  levelColor: "danger" | "warning" | "info" | "default";
  from: string;
  subject: string;
  summary?: string;
  webLink?: string;
  highlight: boolean;
};

type DashboardDeadline = {
  key: string;
  title: string;
  tag: string;
  tagVariant: "danger" | "warning" | "info" | "default";
};

const SNAPSHOT_DEFAULT_SOURCE_ID = "snapshot_default_outlook";

// ─── HTTP Client ─────────────────────────────────────────────────────────────

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

function resolveUrl(path: string): string {
  if (bffBaseUrl) return `${bffBaseUrl}${path}`;
  if (import.meta.env.PROD) return `${window.location.origin}${path}`;
  return path;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await response.text();
  const body = text ? safeJson(text) : {};
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      ? String((body as { error?: unknown }).error ?? `HTTP ${response.status}`)
      : `HTTP ${response.status}`;
    throw new HttpError(response.status, message, body);
  }
  return body as T;
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return { raw }; }
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function sanitizeHttpUrl(rawUrl: string | undefined | null): URL | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed;
  } catch { return null; }
  return null;
}

function isAllowedOutlookWebHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const exactHosts = new Set(["outlook.office.com","outlook.live.com","outlook.office365.com","outlook.office.de","outlook.office.cn","outlook.office.us"]);
  if (exactHosts.has(normalized)) return true;
  const allowedSuffixes = [".outlook.office.com",".outlook.live.com",".outlook.office365.com",".outlook.office.de",".outlook.office.cn",".outlook.office.us"];
  return allowedSuffixes.some((s) => normalized.endsWith(s));
}

function sanitizeExternalLink(rawUrl: string | undefined): string | null {
  const parsed = sanitizeHttpUrl(rawUrl);
  if (!parsed || !isAllowedOutlookWebHost(parsed.hostname) || parsed.protocol !== "https:") return null;
  return parsed.toString();
}

function sanitizeOutlookAuthLink(rawUrl: string | null): string | null {
  const parsed = sanitizeHttpUrl(rawUrl);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  const allowlist = ["composio.dev","composio.com","connect.composio.dev","login.microsoftonline.com","login.live.com"];
  const hostAllowed = allowlist.includes(host) || host.endsWith(".composio.dev") || host.endsWith(".composio.com") || host.endsWith(".microsoftonline.com") || host.endsWith(".live.com");
  if (!hostAllowed) return null;
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocalhost) return null;
  return parsed.toString();
}

function daysUntil(iso: string): number | null {
  const due = Date.parse(iso);
  if (Number.isNaN(due)) return null;
  const diff = due - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const Icons = {
  Mail: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  Home: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  BarChart: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  Calendar: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Settings: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Send: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  ),
  Bell: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  Refresh: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
  ),
  Plus: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  LogOut: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  ),
  Flame: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  Clock: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Check: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Sparkles: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  ),
  Zap: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Bot: () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  ),
  X: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  ),
};

// ─── Mail Item Card ───────────────────────────────────────────────────────────

function MailItemCard({ item, onClick }: { item: DashboardMailItem; onClick?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-4 transition-all duration-200 cursor-pointer",
        item.highlight
          ? "border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 dark:border-red-900/30 dark:bg-red-950/20 dark:hover:bg-red-950/40"
          : "border-zinc-200/60 bg-white/60 hover:border-zinc-300 hover:bg-white/80 dark:border-zinc-800/40 dark:bg-zinc-950/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-950/80"
      )}
    >
      {item.highlight && (
        <div className="absolute -left-px top-0 h-full w-0.5 rounded-full bg-gradient-to-b from-red-500 to-red-300" />
      )}

      <div className={cn(
        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
        item.highlight ? "bg-gradient-to-br from-red-500 to-red-400" : "bg-gradient-to-br from-zinc-600 to-zinc-500"
      )}>
        <span className="text-xs font-bold">{item.from.slice(0, 1).toUpperCase()}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={item.levelColor}>{item.levelLabel}</Badge>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{item.from}</span>
        </div>
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.subject}</p>
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{item.summary}</p>
        )}
      </div>

      {item.highlight && onClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="absolute right-3 top-3 flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 dark:border-blue-900/30 dark:bg-blue-950/40 dark:text-blue-400"
        >
          查看详情 <Icons.ArrowRight />
        </button>
      )}
    </div>
  );
}

// ─── Deadline Item ───────────────────────────────────────────────────────────

function DeadlineItem({ item }: { item: DashboardDeadline }) {
  const tagStyle = {
    danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/30",
    warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30",
    info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30",
    default: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
  };
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200/60 bg-white/60 px-4 py-3 transition-colors hover:bg-white/80 dark:border-zinc-800/40 dark:bg-zinc-950/60 dark:hover:bg-zinc-950/80">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
          <Icons.Calendar />
        </div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{item.title}</span>
      </div>
      <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", tagStyle[item.tagVariant])}>
        {item.tag}
      </span>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, description }: {
  label: string;
  value: number;
  color: "red" | "blue" | "green" | "zinc";
  icon: React.ReactNode;
  description?: string;
}) {
  const colors = {
    red: { bg: "from-red-500/10 to-red-500/5", border: "border-red-200/60", text: "text-red-600", ring: "ring-red-200" },
    blue: { bg: "from-blue-500/10 to-blue-500/5", border: "border-blue-200/60", text: "text-blue-600", ring: "ring-blue-200" },
    green: { bg: "from-emerald-500/10 to-emerald-500/5", border: "border-emerald-200/60", text: "text-emerald-600", ring: "ring-emerald-200" },
    zinc: { bg: "from-zinc-500/10 to-zinc-500/5", border: "border-zinc-200/60", text: "text-zinc-600", ring: "ring-zinc-200" },
  };
  const c = colors[color];

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
      c.bg, c.border
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{value}</p>
          {description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl ring-1 backdrop-blur-sm", c.text, c.ring, c.bg)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Bubble ─────────────────────────────────────────────────────────────

function ChatBubble({ message, isUser }: { message: string; isUser: boolean }) {
  return (
    <div className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-white">
          <Icons.Bot />
        </div>
      )}
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
        isUser
          ? "rounded-br-md bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-blue-500/20"
          : "rounded-bl-md border border-zinc-200/60 bg-white/90 text-zinc-800 backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/90 dark:text-zinc-200"
      )}>
        {message}
      </div>
    </div>
  );
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200",
        active
          ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40"
          : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-900/50"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation();
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeSourceId, setActiveSourceId] = useState(SNAPSHOT_DEFAULT_SOURCE_ID);
  const [connectedMailbox, setConnectedMailbox] = useState("");
  const [triage, setTriage] = useState<MailTriageResult | null>(null);
  const [insights, setInsights] = useState<MailInsightsResult | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMessages, setAgentMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const agentScrollRef = useRef<HTMLDivElement>(null);

  const [outlookBusy, setOutlookBusy] = useState(false);
  const [outlookInfo, setOutlookInfo] = useState<string | null>(null);
  const [outlookError, setOutlookError] = useState<string | null>(null);
  const [outlookRedirectUrl, setOutlookRedirectUrl] = useState<string | null>(null);
  const [outlookConnectedAccountId, setOutlookConnectedAccountId] = useState<string | null>(null);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [devMode, setDevMode] = useState(false);
  const [devErrors, setDevErrors] = useState<DevError[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([
    {
      id: SNAPSHOT_DEFAULT_SOURCE_ID,
      provider: "outlook",
      email: "",
      displayName: "Outlook",
      unreadCount: 0,
      lastSync: new Date(),
      ready: false,
    },
  ]);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // ── Pull to Refresh ────────────────────────────────────────────────────────
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullTouchStartY = useRef<number>(0);
  const pullOffsetY = useRef<number>(0);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);

  const handlePullStart = useCallback((clientY: number) => {
    if (window.scrollY === 0) {
      pullTouchStartY.current = clientY;
      pullOffsetY.current = 0;
    }
  }, []);

  const handlePullMove = useCallback((clientY: number) => {
    if (pullTouchStartY.current === 0 || window.scrollY > 0) return;
    const diff = clientY - pullTouchStartY.current;
    if (diff > 0) {
      pullOffsetY.current = Math.min(diff * 0.5, 120);
      if (pullIndicatorRef.current) {
        pullIndicatorRef.current.style.transform = `translateY(${pullOffsetY.current - 48}px)`;
        pullIndicatorRef.current.style.opacity = String(Math.min(pullOffsetY.current / 80, 1));
      }
    }
  }, []);

  const handlePullEnd = useCallback(async () => {
    if (pullOffsetY.current >= 80) {
      setPullRefreshing(true);
      pullTouchStartY.current = 0;
      pullOffsetY.current = 0;
      if (pullIndicatorRef.current) {
        pullIndicatorRef.current.style.transform = "translateY(-48px)";
        pullIndicatorRef.current.style.opacity = "1";
      }
      await refreshDashboard();
      setPullRefreshing(false);
      if (pullIndicatorRef.current) {
        pullIndicatorRef.current.style.transform = "translateY(-100px)";
        pullIndicatorRef.current.style.opacity = "0";
      }
    } else {
      pullTouchStartY.current = 0;
      pullOffsetY.current = 0;
      if (pullIndicatorRef.current) {
        pullIndicatorRef.current.style.transform = "translateY(-100px)";
        pullIndicatorRef.current.style.opacity = "0";
      }
    }
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    const onStart = (e: TouchEvent) => handlePullStart(e.touches[0].clientY);
    const onMove = (e: TouchEvent) => handlePullMove(e.touches[0].clientY);
    const onEnd = () => handlePullEnd();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [handlePullStart, handlePullMove, handlePullEnd]);

  const dashboardRequestSeqRef = useRef(0);

  function trackError(type: DevError["type"], message: string, detail?: string, extra?: Partial<DevError>) {
    setDevErrors((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, message, detail, timestamp: new Date(), ...extra },
      ...prev.slice(0, 99),
    ]);
  }

  function onSwitchAccount(id: string) {
    if (id === activeSourceId) return;
    setActiveSourceId(id);
    const account = accounts.find((a) => a.id === id);
    if (account) setConnectedMailbox(account.email);
    dashboardRequestSeqRef.current += 1;
    void refreshDashboard();
  }

  function onAddAccount(provider: AccountProvider, email: string) {
    const id = `${provider}_${Date.now()}`;
    const displayName = email.split("@")[0];
    const newAccount: Account = {
      id,
      provider,
      email,
      displayName,
      unreadCount: 0,
      lastSync: null,
      ready: false,
    };
    setAccounts((prev) => [...prev, newAccount]);
    setActiveSourceId(id);
    setConnectedMailbox(email);
    setShowAddAccount(false);
    dashboardRequestSeqRef.current += 1;
    void refreshDashboard();
  }

  function onOAuthAccount(provider: AccountProvider) {
    if (provider === "outlook") {
      setShowAddAccount(false);
      void onLaunchOutlookWindow();
    }
  }

  function onRemoveAccount(id: string) {
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      if (activeSourceId === id && next.length > 0) {
        const first = next[0];
        setActiveSourceId(first.id);
        setConnectedMailbox(first.email);
        dashboardRequestSeqRef.current += 1;
        void refreshDashboard();
      }
      return next;
    });
  }

  // Sync accounts' unread count and ready state from dashboard data
  function syncAccountMeta(id: string, meta: { unreadCount?: number; ready?: boolean; lastSync?: Date }) {
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, ...meta } : a));
  }

  const counts = useMemo(
    () => triage?.counts ?? { urgent_important: 0, not_urgent_important: 0, urgent_not_important: 0, not_urgent_not_important: 0 },
    [triage]
  );

  const mailItems = useMemo<DashboardMailItem[]>(() => {
    const items: DashboardMailItem[] = [];
    const quadrantMap: Record<string, { label: string; color: DashboardMailItem["levelColor"] }> = {
      urgent_important: { label: t("quadrant.urgent_important"), color: "danger" },
      not_urgent_important: { label: t("quadrant.not_urgent_important"), color: "warning" },
      urgent_not_important: { label: t("quadrant.urgent_not_important"), color: "info" },
      not_urgent_not_important: { label: t("quadrant.not_urgent_not_important"), color: "default" },
    };
    for (const [key, q] of Object.entries(quadrantMap)) {
      const mails = triage?.quadrants[key as MailQuadrant] ?? [];
      mails.slice(0, 3).forEach((m, i) => {
        items.push({
          key: m.id,
          levelLabel: q.label,
          levelColor: q.color,
          from: m.fromName,
          subject: m.subject,
          summary: m.aiSummary,
          webLink: m.webLink,
          highlight: key === "urgent_important" && i === 0,
        });
      });
    }
    return items;
  }, [triage, t]);

  const deadlineItems = useMemo<DashboardDeadline[]>(() => {
    const dynamic = (insights?.upcoming ?? []).slice(0, 4).map((item) => {
      const day = daysUntil(item.dueAt);
      let tag = item.dueDateLabel;
      let tagVariant: DashboardDeadline["tagVariant"] = "default";
      if (day !== null) {
      if (day === 0) { tag = t("dashboard.todayDeadline"); tagVariant = "danger"; }
      else if (day <= 1) { tag = t("dashboard.daysLeft", { count: day }); tagVariant = "danger"; }
      else if (day <= 3) { tag = t("dashboard.daysLeft", { count: day }); tagVariant = "warning"; }
      else { tag = t("dashboard.daysLeft", { count: day }); tagVariant = "info"; }
      }
      return { key: item.messageId, title: item.subject, tag, tagVariant };
    });
    if (dynamic.length > 0) return dynamic;
    return [
      { key: "fallback_1", title: t("dashboard.fallbackDeadline1"), tag: t("dashboard.daysLeft", { count: 2 }), tagVariant: "warning" as const },
      { key: "fallback_2", title: t("dashboard.fallbackDeadline2"), tag: t("dashboard.daysLeft", { count: 5 }), tagVariant: "info" as const },
    ];
  }, [insights, t]);

  const totalMail = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  // ── Data loading ─────────────────────────────────────────────────────────

  async function loadSourcesAndMailbox(): Promise<{ sourceId: string; mailbox: string; hasReadySource: boolean }> {
    const sourceResponse = await fetchJson<MailSourcesEnvelope>("/api/mail/sources");
    const nextSourceId = sourceResponse.result.activeSourceId || SNAPSHOT_DEFAULT_SOURCE_ID;
    const readySources = sourceResponse.result.sources.filter((item) => item.enabled && item.ready);
    const activeSource =
      sourceResponse.result.sources.find((item) => item.id === nextSourceId && item.enabled && item.ready) ??
      sourceResponse.result.sources.find((item) => item.id === SNAPSHOT_DEFAULT_SOURCE_ID && item.enabled && item.ready) ??
      readySources[0] ??
      sourceResponse.result.sources.find((item) => item.enabled) ??
      sourceResponse.result.sources[0];
    const resolvedSourceId = activeSource?.id ?? SNAPSHOT_DEFAULT_SOURCE_ID;
    const mailbox = activeSource?.mailboxUserId?.trim() || activeSource?.emailHint?.trim() || connectedMailbox;
    return { sourceId: resolvedSourceId, mailbox: mailbox || "", hasReadySource: Boolean(activeSource?.enabled && activeSource?.ready) };
  }

  async function loadDashboardBySource(sourceId: string) {
    const [triageResponse, insightResponse] = await Promise.all([
      fetchJson<MailTriageEnvelope>(`/api/mail/triage?limit=35&sourceId=${encodeURIComponent(sourceId)}`),
      fetchJson<MailInsightsEnvelope>(`/api/mail/insights?limit=35&horizonDays=7&tz=${encodeURIComponent(clientTimeZone)}&sourceId=${encodeURIComponent(sourceId)}`),
    ]);
    return { triage: triageResponse.result, insights: insightResponse.result };
  }

  function isRoutingFailFastError(error: unknown): boolean {
    if (!(error instanceof HttpError) || error.status !== 412) return false;
    const payload = error.payload as { errorCode?: unknown } | null;
    if (payload && "errorCode" in payload) return String(payload.errorCode ?? "").startsWith("MAIL_SOURCE_");
    return true;
  }

  async function refreshDashboard() {
    const requestSeq = ++dashboardRequestSeqRef.current;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const source = await loadSourcesAndMailbox();
      if (requestSeq !== dashboardRequestSeqRef.current) return;
      setActiveSourceId(source.sourceId);
      setConnectedMailbox(source.mailbox);

      if (!source.hasReadySource) {
        setTriage(null);
        setInsights(null);
        setDashboardError(t("dashboard.noMailError"));
        return;
      }

      try {
        const data = await loadDashboardBySource(source.sourceId);
        if (requestSeq !== dashboardRequestSeqRef.current) return;
        setTriage(data.triage);
        setInsights(data.insights);
      } catch (error) {
        if (isRoutingFailFastError(error)) {
          const fallback = await loadSourcesAndMailbox();
          if (requestSeq !== dashboardRequestSeqRef.current) return;
          setActiveSourceId(fallback.sourceId);
          setConnectedMailbox(fallback.mailbox);
          if (fallback.hasReadySource && fallback.sourceId !== source.sourceId) {
            setTriage(null);
            setInsights(null);
            const fallbackData = await loadDashboardBySource(fallback.sourceId);
            if (requestSeq !== dashboardRequestSeqRef.current) return;
            setTriage(fallbackData.triage);
            setInsights(fallbackData.insights);
            setDashboardError(t("dashboard.sourceSwitched"));
            return;
          }
        }
        // For any other error (including 401 from gateway), show error but don't logout
        setTriage(null);
        setInsights(null);
        const msg = errorMessage(error);
        setDashboardError(msg);
        trackError("api", msg, error instanceof HttpError ? JSON.stringify(error.payload ?? {}) : undefined, {
          status: error instanceof HttpError ? error.status : undefined,
        });
      }
    } finally {
      if (requestSeq === dashboardRequestSeqRef.current) setDashboardLoading(false);
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        await fetchJson<{ ok: boolean; agentId: string; allowedTools: string[] }>("/api/meta");
        setIsAuthenticated(true);
        await refreshDashboard();
      } catch (error) {
        setIsAuthenticated(false);
        if (!(error instanceof HttpError && error.status === 401)) setAuthError(errorMessage(error));
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (agentScrollRef.current) {
      agentScrollRef.current.scrollTop = agentScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKeyInput.trim()) { setAuthError(t("auth.apiKeyPlaceholder")); return; }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await fetchJson<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      setIsAuthenticated(true);
      setTriage(null);
      setInsights(null);
      setDashboardError(null);
      setAgentMessages([]);
      await refreshDashboard();
    } catch (error) {
      setAuthError(errorMessage(error));
      trackError("error", errorMessage(error), error instanceof HttpError ? JSON.stringify(error.payload ?? {}) : undefined, {
        status: error instanceof HttpError ? error.status : undefined,
        url: "/api/auth/login",
        method: "POST",
      });
    } finally {
      setAuthBusy(false);
    }
  }

  async function onLogout() {
    dashboardRequestSeqRef.current += 1;
    setAuthBusy(true);
    try {
      await fetchJson<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch { /* ignore */ }
    setIsAuthenticated(false);
    setApiKeyInput("");
    setAuthBusy(false);
    setActiveSourceId(SNAPSHOT_DEFAULT_SOURCE_ID);
    setConnectedMailbox("");
    setTriage(null);
    setInsights(null);
    setDashboardError(null);
    setAgentMessages([]);
    setAgentError(null);
  }

  async function onLaunchOutlookWindow() {
    if (!isAuthenticated || outlookBusy) return;
    const popup = window.open("about:blank", "composio_outlook_auth", "popup=yes,width=520,height=760,noopener,noreferrer");
    if (!popup) { setOutlookError(t("account.popupBlocked")); return; }
    setOutlookBusy(true);
    setOutlookError(null);
    setOutlookInfo(null);
    try {
      const response = await fetchJson<OutlookLaunchEnvelope>("/api/mail/connections/outlook/launch-auth", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const safeRedirectUrl = sanitizeOutlookAuthLink(response.result.redirectUrl);
      setOutlookRedirectUrl(safeRedirectUrl);
      setConnectedAccountId(response.result.connectedAccountId);
      if (!safeRedirectUrl) {
        popup.close();
        if (response.result.sessionInstructions) {         setOutlookInfo(`授权已发起：${response.result.sessionInstructions}`); return; }
        setOutlookError(t("account.noValidRedirect"));
        return;
      }
      popup.location.replace(safeRedirectUrl);
      popup.focus();
      setOutlookInfo(t("account.openAuthWindow"));
      const onFocus = () => { window.removeEventListener("focus", onFocus); void refreshDashboard(); };
      window.addEventListener("focus", onFocus, { once: true });
    } catch (error) {
      popup.close();
      setOutlookError(errorMessage(error));
    } finally {
      setOutlookBusy(false);
    }
  }

  function onViewMailDetail(item: DashboardMailItem) {
    const safeLink = sanitizeExternalLink(item.webLink);
    if (safeLink) { window.open(safeLink, "_blank", "noopener,noreferrer"); return; }
    const viewerUrl = new URL("/mailbox-viewer.html", window.location.origin).toString();
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  }

  async function onAskAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = agentInput.trim();
    if (!question || agentBusy) return;
    setAgentMessages((prev) => [...prev, { role: "user", content: question }]);
    setAgentInput("");
    setAgentBusy(true);
    setAgentError(null);
    try {
      const response = await fetchJson<MailQueryEnvelope>("/api/mail/query", {
        method: "POST",
        body: JSON.stringify({ question, limit: 35, horizonDays: 7, tz: clientTimeZone, sourceId: activeSourceId }),
      });
      setAgentMessages((prev) => [...prev, { role: "assistant", content: response.result.answer }]);
    } catch (error) {
      setAgentError(errorMessage(error));
      trackError("api", "AI 请求失败: " + errorMessage(error), error instanceof HttpError ? JSON.stringify(error.payload ?? {}) : undefined, {
        status: error instanceof HttpError ? error.status : undefined,
        url: "/api/mail/query",
        method: "POST",
      });
      setAgentMessages((prev) => prev.slice(0, -1));
    } finally {
      setAgentBusy(false);
    }
  }

  // ── Auth Loading ─────────────────────────────────────────────────────────

  if (authChecking) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <DotGridBackground dotColor="#94a3b8" dotSize={1.2} spacing={24} />
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50/80 via-white/60 to-blue-50/60 dark:from-zinc-950/80 dark:via-zinc-950/60 dark:to-violet-950/60" />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-blue-600" />
            <p className="text-sm text-zinc-500">{t("common.loading")}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Login ────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <DotGridBackground dotColor="#94a3b8" dotSize={1.2} spacing={24} />
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50/80 via-white/60 to-blue-50/60 dark:from-zinc-950/80 dark:via-zinc-950/60 dark:to-violet-950/60" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{t("common.appName")}</h1>
            </div>

            <BentoCard className="p-6">
              <form onSubmit={onLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                    {t("auth.apiKeyLabel")}
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={t("auth.apiKeyPlaceholder")}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                    autoComplete="current-password"
                  />
                </div>
                <RippleButton type="submit" className="w-full" disabled={authBusy}>
                  {authBusy ? t("auth.loginLoading") : t("auth.loginButton")}
                </RippleButton>
              </form>
              {authError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                  <Icons.AlertCircle />
                  {authError}
                </div>
              )}
            </BentoCard>

            <p className="mt-6 text-center text-xs text-zinc-400">
              {t("auth.loginHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  return (
    <ThemeProvider>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Sidebar */}
        <ResizableSidebar
          accounts={accounts}
          activeAccountId={activeSourceId}
          onSwitchAccount={onSwitchAccount}
          onAddAccount={() => setShowAddAccount(true)}
          onRemoveAccount={onRemoveAccount}
          activeNav={activeNav}
          onNavChange={setActiveNav}
          devMode={devMode}
          onToggleDevMode={() => setDevMode((v) => !v)}
          onLogout={() => void onLogout()}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        {/* Main */}
        <div className="flex-1 pb-28 pl-16 transition-all duration-300">
          {/* Header */}
          <header className="sticky top-0 z-20 border-b border-zinc-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
            {/* Pull to refresh indicator */}
            <div
              ref={pullIndicatorRef}
              className="absolute inset-x-0 flex items-center justify-center transition-all duration-300"
              style={{ height: 48, transform: "translateY(-100px)", opacity: 0, pointerEvents: "none" }}
          >
            {pullRefreshing || dashboardLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
            ) : (
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12l7-7 7 7" />
              </svg>
            )}
          </div>

          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1" />
            <div className="flex items-center gap-2">
              <AnimatedThemeToggler />
              {counts.urgent_important > 0 && (
                <div className="relative">
                  <button className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/60 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900">
                    <Icons.Bell />
                  </button>
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {counts.urgent_important}
                  </span>
                </div>
              )}
            </div>
          </div>

          {outlookInfo && (
            <div className="mx-auto max-w-5xl px-4 pb-2 text-xs text-blue-600 dark:text-blue-400 sm:px-6">
              {outlookInfo}
              {connectedAccountId && <span className="ml-2 font-mono">{connectedAccountId}</span>}
            </div>
          )}
          {outlookError && (
            <div className="mx-auto max-w-5xl px-4 pb-2 text-xs text-red-600 dark:text-red-400 sm:px-6">
              <Icons.AlertCircle className="mr-1 inline h-3 w-3" />
              {outlookError}
            </div>
          )}
        </header>

        {/* Content */}
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">

          {/* Dev Panel */}
          {devMode && (
            <DevPanel
              errors={devErrors}
              onClear={() => setDevErrors([])}
            />
          )}

          {/* ── Home Page ── */}
          {activeNav === "home" && (
            <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {dashboardLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label={t("quadrant.urgent_important")}
                  value={counts.urgent_important}
                  color="red"
                  icon={<Icons.Flame />}
                  description={t("quadrant.urgent_importantDesc")}
                />
                <StatCard
                  label={t("quadrant.not_urgent_important")}
                  value={counts.not_urgent_important}
                  color="blue"
                  icon={<Icons.Clock />}
                  description={t("quadrant.not_urgent_importantDesc")}
                />
                <StatCard
                  label={t("quadrant.urgent_not_important")}
                  value={counts.urgent_not_important}
                  color="zinc"
                  icon={<Icons.Zap />}
                  description={t("quadrant.urgent_not_importantDesc")}
                />
                <StatCard
                  label={t("quadrant.not_urgent_not_important")}
                  value={counts.not_urgent_not_important}
                  color="zinc"
                  icon={<Icons.Check />}
                  description={t("quadrant.not_urgent_not_importantDesc")}
                />
              </>
            )}
          </div>

          {/* Bento Grid */}
          <div className="grid gap-4 lg:grid-cols-5">
            {/* Mail List */}
            <div className="lg:col-span-3">
                <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("dashboard.mailClassification")}</h2>
                  {triage && (
                    <Badge variant="info">{t("dashboard.emailsCount", { count: totalMail })}</Badge>
                  )}
                </div>
                {triage?.generatedAt && (
                  <span className="text-xs text-zinc-400">
                    {formatGeneratedAt(triage.generatedAt)}
                  </span>
                )}
              </div>
              {dashboardLoading ? (
                <div className="space-y-3">
                  <MailCardSkeleton />
                  <MailCardSkeleton />
                  <MailCardSkeleton />
                </div>
              ) : mailItems.length === 0 ? (
                <BentoCard className="py-12 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <Icons.Mail />
                  </div>
                  <p className="text-sm text-zinc-500">{t("dashboard.noMailData")}</p>
                  <p className="mt-1 text-xs text-zinc-400">{t("dashboard.needOutlookAuth")}</p>
                </BentoCard>
              ) : (
                <AnimatedList className="space-y-3" delay={60}>
                  {mailItems.map((item) => (
                    <AnimatedListItem key={item.key}>
                      <MailItemCard item={item} onClick={() => onViewMailDetail(item)} />
                    </AnimatedListItem>
                  ))}
                </AnimatedList>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4 lg:col-span-2">
              {/* AI Chat */}
              <BentoCard gradient>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-white">
                    <Icons.Bot />
                  </div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("agent.title")}</h2>
                  <Badge variant="success" className="ml-auto text-[10px]">{t("common.online")}</Badge>
                </div>

                {/* Messages */}
                <div ref={agentScrollRef} className="mb-3 max-h-52 overflow-y-auto space-y-3 scrollbar-thin">
                  {agentMessages.length === 0 && !agentBusy && (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-500">
                        <Icons.Sparkles />
                      </div>
                      <p className="text-xs text-zinc-500">{t("agent.placeholder")}</p>
                    </div>
                  )}
                  {agentMessages.map((msg, i) => (
                    <ChatBubble key={i} message={msg.content} isUser={msg.role === "user"} />
                  ))}
                  {agentBusy && (
                    <ChatBubble message={t("agent.thinking")} isUser={false} />
                  )}
                </div>

                <form onSubmit={onAskAgent} className="flex items-center gap-2">
                  <input
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    placeholder={t("agent.placeholder")}
                    className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-blue-500"
                    maxLength={300}
                    disabled={agentBusy}
                  />
                  <button
                    type="submit"
                    disabled={agentBusy || !agentInput.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white transition-all hover:shadow-lg hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icons.Send />
                  </button>
                </form>
                {agentError && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                    <Icons.AlertCircle /> {agentError}
                  </p>
                )}
              </BentoCard>

              {/* Deadlines */}
              <BentoCard>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("dashboard.deadlines")}</h2>
                  <Badge variant="warning" className="ml-auto">
                    {deadlineItems.length} {t("common.items")}
                  </Badge>
                </div>
                {dashboardLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                  </div>
                ) : (
                  <AnimatedList className="space-y-2" delay={80}>
                    {deadlineItems.map((item) => (
                      <AnimatedListItem key={item.key}>
                        <DeadlineItem item={item} />
                      </AnimatedListItem>
                    ))}
                  </AnimatedList>
                )}
              </BentoCard>
            </div>
          </div>
            </>
          )}

          {/* ── Stats Page ── */}
          {activeNav === "stats" && (
            <StatsPage
              triage={triage}
              insights={insights}
              loading={dashboardLoading}
              connectedMailbox={connectedMailbox}
            />
          )}

          {/* ── Calendar Page ── */}
          {activeNav === "calendar" && (
            <CalendarPage
              insights={insights}
              loading={dashboardLoading}
              connectedMailbox={connectedMailbox}
            />
          )}

          {/* ── Settings Page ── */}
          {activeNav === "settings" && (
            <SettingsPage
              connectedMailbox={connectedMailbox}
              connectedAccountId={connectedAccountId}
              onLogout={() => void onLogout()}
            />
          )}
        </main>
      </div>

      {/* Mobile Dock */}
      <Dock
        className=""
        panelHeight={64}
        baseItemSize={48}
        magnification={56}
        distance={150}
        items={[
          {
            icon: <Icons.Home />,
            label: "主页",
            isActive: activeNav === "home",
            onClick: () => setActiveNav("home"),
          },
          {
            icon: <Icons.BarChart />,
            label: "统计",
            isActive: activeNav === "stats",
            onClick: () => setActiveNav("stats"),
          },
          {
            icon: <Icons.Calendar />,
            label: "日程",
            isActive: activeNav === "calendar",
            onClick: () => setActiveNav("calendar"),
          },
          {
            icon: <Icons.Settings />,
            label: "设置",
            isActive: activeNav === "settings",
            onClick: () => setActiveNav("settings"),
          },
          {
            icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
            label: "账户",
            isActive: false,
            onClick: () => setShowAddAccount(true),
          },
        ]}
      />

      {/* Add Account Modal */}
      <AddAccountModal
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onAdd={onAddAccount}
        onOAuth={onOAuthAccount}
        busy={outlookBusy}
      />

      {/* OmniSearchBar - 语义检索助手 */}
      <OmniSearchBar />
    </div>
  </ThemeProvider>
);
}
