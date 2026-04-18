import { useMemo, useState, type ReactNode } from "react";
import type { MailNotificationPollResult } from "@mail-agent/shared-types";

interface NotificationCenterProps {
  warnings?: Array<{ message: string }>;
  snapshot?: MailNotificationPollResult | null;
  loading?: boolean;
  sourceReady?: boolean;
  streamStatus?: "idle" | "connecting" | "connected" | "error";
  streamError?: string | null;
  desktopPermission?: NotificationPermission | "unsupported";
  onEnableDesktop?: () => void | Promise<unknown>;
  onRefresh?: () => void | Promise<unknown>;
  children?: ReactNode;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationCenter({
  warnings = [],
  snapshot = null,
  loading = false,
  sourceReady = false,
  streamStatus = "idle",
  streamError = null,
  desktopPermission = "unsupported",
  onEnableDesktop,
  onRefresh,
  children,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const urgentItems = snapshot?.urgent.newItems ?? [];
  const digest = snapshot?.dailyDigest ?? null;
  const unreadCount = warnings.length + urgentItems.length + (digest ? 1 : 0);
  const hasContent = unreadCount > 0;
  const triageLabel = useMemo(() => {
    if (!snapshot) {
      return "连接邮箱后开始接收提醒";
    }

    return `${snapshot.triage.total} 封已扫描，${snapshot.urgent.totalUrgentImportant} 封紧急重要`;
  }, [snapshot]);

  const handleRefresh = () => {
    void onRefresh?.();
  };

  const handleEnableDesktop = () => {
    void onEnableDesktop?.();
  };

  const streamTone =
    streamStatus === "connected"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
      : streamStatus === "connecting"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        : streamStatus === "error"
          ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  const streamLabel =
    streamStatus === "connected"
      ? "实时已连接"
      : streamStatus === "connecting"
        ? "实时连接中"
        : streamStatus === "error"
          ? "实时异常"
          : "等待连接";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        aria-label="通知"
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-3 dark:border-zinc-800">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">通知</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{triageLabel}</p>
              {snapshot?.generatedAt && (
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  更新于 {formatDateTime(snapshot.generatedAt)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${streamTone}`}>
                  {streamLabel}
                </span>
                {desktopPermission === "granted" ? (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    桌面提醒已开启
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!sourceReady || loading}
              className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {loading ? "同步中" : "同步"}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!sourceReady ? (
              <div className="p-4 text-sm text-zinc-500 dark:text-zinc-400">连接邮箱后开始接收提醒。</div>
            ) : !hasContent ? (
              <div className="p-4 text-sm text-zinc-500 dark:text-zinc-400">暂无新的紧急事项。</div>
            ) : null}

            {sourceReady && desktopPermission === "default" && (
              <div className="border-b border-zinc-100 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  允许浏览器桌面提醒后，紧急邮件和每日摘要会在系统通知中即时弹出。
                </p>
                <button
                  type="button"
                  onClick={handleEnableDesktop}
                  className="mt-2 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
                >
                  启用桌面提醒
                </button>
              </div>
            )}

            {sourceReady && desktopPermission === "denied" && (
              <div className="border-b border-zinc-100 p-3 text-xs text-amber-700 dark:border-zinc-800 dark:text-amber-300">
                浏览器已阻止桌面提醒，请在浏览器权限设置中重新开启。
              </div>
            )}

            {streamError && (
              <div className="border-b border-zinc-100 bg-red-50/80 p-3 text-xs text-red-700 dark:border-zinc-800 dark:bg-red-950/20 dark:text-red-300">
                {streamError}
              </div>
            )}

            {warnings.length > 0 &&
              warnings.map((warning, index) => (
                <div
                  key={`warning-${index}`}
                  className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <p className="min-w-0 text-sm text-amber-900 dark:text-amber-100">{warning.message}</p>
                </div>
              ))}

            {urgentItems.map((item) => (
              <div key={item.messageId} className="border-b border-zinc-100 p-3 dark:border-zinc-800">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-600" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">紧急重要</p>
                    {item.webLink ? (
                      <a
                        href={item.webLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-words text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {item.subject || "无主题邮件"}
                      </a>
                    ) : (
                      <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.subject || "无主题邮件"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.fromName || item.fromAddress || "未知发件人"} · {formatDateTime(item.receivedDateTime)}
                    </p>
                    {item.reasons.length > 0 && (
                      <p className="mt-2 break-words text-xs text-zinc-600 dark:text-zinc-300">
                        {item.reasons.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {digest && (
              <div className="p-3">
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">每日摘要</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  今天 {digest.digest.total} 封邮件，{digest.digest.urgentImportant} 封紧急重要
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  未读 {digest.digest.unread} · 高优先级 {digest.digest.highImportance} · 近期事项 {digest.digest.upcomingCount}
                </p>
                {(digest.tomorrowDdl.length > 0 || digest.upcoming.length > 0) && (
                  <ul className="mt-2 space-y-1">
                    {[...digest.tomorrowDdl, ...digest.upcoming].slice(0, 4).map((item) => (
                      <li key={`${item.messageId}-${item.dueDateLabel}`} className="break-words text-xs text-zinc-600 dark:text-zinc-300">
                        {item.subject} · {item.dueDateLabel}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
