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
    <header className="glass-panel sticky top-3 z-30 rounded-2xl bg-white/90 px-4 py-3 backdrop-blur-md dark:bg-zinc-900/90 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左侧：Logo 和用户信息 */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Mery · Make Every Emails Really Yours
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {activeSource?.name || activeSource?.emailHint || "未连接邮箱"}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {user?.displayName || user?.email || "未登录"}
          </p>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 移动端菜单按钮 */}
          <button
            type="button"
            onClick={onMenuToggle}
            className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:hidden"
            aria-label="菜单"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* 语言切换 */}
          <div
            className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
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
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  locale === l
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {l === "zh" ? "中文" : l === "en" ? "EN" : "JA"}
              </button>
            ))}
          </div>

          {/* 主题切换 */}
          <button
            type="button"
            onClick={handleThemeToggle}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            aria-label="切换主题"
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
            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <span className={isLoadingMail || isPollingNotifications ? "animate-spin" : ""}>
              <RefreshIcon />
            </span>
            刷新
          </button>

          <button
            type="button"
            onClick={() => openAgentWindow(activeSourceId)}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Agent 窗口
          </button>

          {/* 登出按钮 */}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-600 transition hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
