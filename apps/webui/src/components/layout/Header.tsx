/**
 * 顶部栏
 * 使用 AuthContext 和 MailContext
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { useTheme } from "../../contexts/ThemeContext";
import { openAgentWindow } from "../../utils/agentWindow";
import { NotificationCenter } from "../notification";
import { RefreshIcon } from "../shared/Icons";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { locale, setLocale } = useApp();
  const {
    activeSourceId,
    sources,
    fetchTriage,
    fetchInsights,
    isLoadingMail,
    notificationSnapshot,
    isPollingNotifications,
    notificationStreamStatus,
    notificationStreamError,
    pollNotifications,
  } = useMail();
  const { setTheme, resolvedTheme } = useTheme();
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const seenUrgentNotificationKeysRef = useRef<Set<string>>(new Set());
  const seenDigestNotificationKeysRef = useRef<Set<string>>(new Set());

  const activeSource = sources.find((s) => s.id === activeSourceId);
  const copy =
    locale === "en"
      ? {
          sourceReady: "Mailbox ready",
          sourcePending: "Needs verification",
          streamConnected: "Realtime syncing",
          streamConnecting: "Connecting stream",
          streamError: "Stream error",
          streamIdle: "Stream idle",
          desktopGranted: "Desktop alerts enabled",
          desktopDenied: "Desktop alerts blocked",
          desktopDefault: "Desktop alerts not granted",
          desktopUnsupported: "Browser unsupported",
          noMailbox: "No mailbox connected",
          notLoggedIn: "Not signed in",
          menu: "Menu",
          toggleTheme: "Toggle theme",
          refresh: "Refresh",
          agentWindow: "Agent Window",
          logout: "Log out",
        }
      : locale === "ja"
        ? {
            sourceReady: "メール準備完了",
            sourcePending: "確認待ち",
            streamConnected: "リアルタイム同期中",
            streamConnecting: "通知接続中",
            streamError: "通知異常",
            streamIdle: "通知待機中",
            desktopGranted: "デスクトップ通知オン",
            desktopDenied: "デスクトップ通知拒否",
            desktopDefault: "デスクトップ通知未許可",
            desktopUnsupported: "ブラウザ未対応",
            noMailbox: "メール未接続",
            notLoggedIn: "未ログイン",
            menu: "メニュー",
            toggleTheme: "テーマ切替",
            refresh: "更新",
            agentWindow: "Agent Window",
            logout: "ログアウト",
          }
        : {
            sourceReady: "邮箱已就绪",
            sourcePending: "等待验证",
            streamConnected: "实时同步中",
            streamConnecting: "正在连接通知流",
            streamError: "通知流异常",
            streamIdle: "通知流待机",
            desktopGranted: "桌面提醒已开启",
            desktopDenied: "桌面提醒被阻止",
            desktopDefault: "桌面提醒未授权",
            desktopUnsupported: "浏览器不支持桌面提醒",
            noMailbox: "未连接邮箱",
            notLoggedIn: "未登录",
            menu: "菜单",
            toggleTheme: "切换主题",
            refresh: "刷新",
            agentWindow: "Agent 窗口",
            logout: "退出",
          };
  const sourceStatusLabel = activeSource?.ready ? copy.sourceReady : copy.sourcePending;
  const streamStatusLabel =
    notificationStreamStatus === "connected"
      ? copy.streamConnected
      : notificationStreamStatus === "connecting"
        ? copy.streamConnecting
        : notificationStreamStatus === "error"
          ? copy.streamError
          : copy.streamIdle;
  const desktopStatusLabel =
    desktopPermission === "granted"
      ? copy.desktopGranted
      : desktopPermission === "denied"
        ? copy.desktopDenied
        : desktopPermission === "default"
          ? copy.desktopDefault
          : copy.desktopUnsupported;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.Notification === "undefined") {
      setDesktopPermission("unsupported");
      return;
    }
    setDesktopPermission(window.Notification.permission);
  }, []);

  useEffect(() => {
    seenUrgentNotificationKeysRef.current.clear();
    seenDigestNotificationKeysRef.current.clear();
  }, [activeSourceId]);

  useEffect(() => {
    if (
      desktopPermission !== "granted" ||
      typeof window === "undefined" ||
      typeof window.Notification === "undefined" ||
      !notificationSnapshot
    ) {
      return;
    }

    const sourceKey = notificationSnapshot.sourceId;
    for (const item of notificationSnapshot.urgent.newItems) {
      const key = `${sourceKey}:${item.messageId}`;
      if (seenUrgentNotificationKeysRef.current.has(key)) {
        continue;
      }
      seenUrgentNotificationKeysRef.current.add(key);
      const notification = new window.Notification(`紧急邮件：${item.subject || "无主题邮件"}`, {
        body: `${item.fromName || item.fromAddress || "未知发件人"}${item.reasons.length ? ` · ${item.reasons.join(" · ")}` : ""}`,
        tag: `mail-urgent-${key}`,
      });
      notification.onclick = () => {
        if (item.webLink) {
          window.open(item.webLink, "_blank", "noopener,noreferrer");
        } else {
          window.focus();
        }
        notification.close();
      };
    }

    if (notificationSnapshot.dailyDigest) {
      const digestKey = `${sourceKey}:${notificationSnapshot.dailyDigest.dateKey}`;
      if (!seenDigestNotificationKeysRef.current.has(digestKey)) {
        seenDigestNotificationKeysRef.current.add(digestKey);
        const { digest } = notificationSnapshot.dailyDigest;
        const notification = new window.Notification("今日邮件摘要", {
          body: `${digest.total} 封邮件，${digest.urgentImportant} 封紧急重要，${digest.upcomingCount} 个近期事项`,
          tag: `mail-digest-${digestKey}`,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }
  }, [desktopPermission, notificationSnapshot]);

  const handleEnableDesktopNotifications = useCallback(async () => {
    if (typeof window === "undefined" || typeof window.Notification === "undefined") {
      setDesktopPermission("unsupported");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setDesktopPermission(permission);
  }, []);

  const handleRefresh = useCallback(() => {
    if (activeSourceId) {
      fetchTriage(50);
      fetchInsights(50, 7);
      void pollNotifications(40, 7);
    }
  }, [activeSourceId, fetchTriage, fetchInsights, pollNotifications]);

  const handleLogout = useCallback(async () => {
    if (confirm("确定要退出登录吗？")) {
      await logout();
    }
  }, [logout]);

  const handleThemeToggle = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return (
    <header className="glass-panel sticky top-3 z-30 overflow-hidden rounded-[28px] border-white/75 bg-white/78 px-4 py-3.5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/74 sm:px-5">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/55 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600/80 dark:text-sky-300/70">
              Mery
            </p>
            <span className="rounded-full bg-sky-100/80 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              {sourceStatusLabel}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              notificationStreamStatus === "connected"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300"
                : notificationStreamStatus === "error"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/35 dark:text-red-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300"
            }`}>
              {streamStatusLabel}
            </span>
          </div>

          <p className="mt-2 truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {activeSource?.name || activeSource?.emailHint || copy.noMailbox}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{user?.displayName || user?.email || copy.notLoggedIn}</span>
            <span className="hidden h-1 w-1 rounded-full bg-zinc-300 sm:inline-block dark:bg-zinc-700" />
            <span>{desktopStatusLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onMenuToggle}
            className="rounded-xl border border-white/65 bg-white/85 p-2 text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:bg-zinc-800 md:hidden"
            aria-label={copy.menu}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div
            className="inline-flex rounded-xl border border-white/65 bg-white/85 p-0.5 shadow-sm dark:border-white/10 dark:bg-zinc-900/80"
            role="tablist"
            aria-label="选择语言"
          >
            {(["zh", "en", "ja"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={locale === l}
                onClick={() => setLocale(l)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  locale === l
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {l === "zh" ? "中文" : l === "en" ? "EN" : "JA"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleThemeToggle}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/65 bg-white/85 px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-300"
            aria-label={copy.toggleTheme}
          >
            {resolvedTheme === "dark" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <NotificationCenter
            snapshot={notificationSnapshot}
            loading={isPollingNotifications}
            sourceReady={Boolean(activeSourceId)}
            streamStatus={notificationStreamStatus}
            streamError={notificationStreamError}
            desktopPermission={desktopPermission}
            onEnableDesktop={handleEnableDesktopNotifications}
            onRefresh={() => pollNotifications(40, 7)}
          />

          {/* 刷新按钮 */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoadingMail || isPollingNotifications}
            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-white/65 bg-white/85 px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-300"
          >
            <span className={isLoadingMail || isPollingNotifications ? "animate-spin" : ""}>
              <RefreshIcon />
            </span>
            {copy.refresh}
          </button>

          <button
            type="button"
            onClick={() => openAgentWindow(activeSourceId)}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/65 bg-white/85 px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-300"
          >
            {copy.agentWindow}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/65 bg-white/85 px-3 text-xs font-medium text-zinc-600 transition hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-400"
          >
            {copy.logout}
          </button>
        </div>
      </div>
    </header>
  );
}
