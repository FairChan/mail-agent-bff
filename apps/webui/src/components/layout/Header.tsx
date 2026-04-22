/**
 * 顶部栏
 * 使用 AuthContext 和 MailContext
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { NotificationCenter } from "../notification";
import { BrandLogo } from "../shared/BrandLogo";
import { RefreshIcon } from "../shared/Icons";
import { AnimatedThemeToggle } from "../ui/AnimatedThemeToggle";
import { CalmButton, CalmPill } from "../ui/Calm";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { locale } = useApp();
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
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const seenUrgentNotificationKeysRef = useRef<Set<string>>(new Set());
  const seenDigestNotificationKeysRef = useRef<Set<string>>(new Set());

  const activeSource = sources.find((s) => s.id === activeSourceId);
  const copy =
    locale === "en"
      ? {
          sourceReady: "Mailbox ready",
          sourcePending: "Needs verification",
          streamConnected: "Syncing",
          streamConnecting: "Connecting",
          streamError: "Sync issue",
          streamIdle: "Idle",
          noMailbox: "No mailbox connected",
          notLoggedIn: "Not signed in",
          menu: "Menu",
          toggleTheme: "Toggle theme",
          refresh: "Refresh",
          logout: "Log out",
        }
      : locale === "ja"
        ? {
            sourceReady: "メール準備完了",
            sourcePending: "確認待ち",
            streamConnected: "同期中",
            streamConnecting: "接続中",
            streamError: "同期異常",
            streamIdle: "待機中",
            noMailbox: "メール未接続",
            notLoggedIn: "未ログイン",
            menu: "メニュー",
            toggleTheme: "テーマ切替",
            refresh: "更新",
            logout: "ログアウト",
          }
        : {
            sourceReady: "邮箱已就绪",
            sourcePending: "等待验证",
            streamConnected: "同步中",
            streamConnecting: "连接中",
            streamError: "同步异常",
            streamIdle: "待机",
            noMailbox: "未连接邮箱",
            notLoggedIn: "未登录",
            menu: "菜单",
            toggleTheme: "切换主题",
            refresh: "刷新",
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
        const dailyDigest = notificationSnapshot.dailyDigest;
        const { digest } = dailyDigest;
        const notification = new window.Notification("今日邮件摘要", {
          body:
            dailyDigest.summaryLines?.[0] ||
            dailyDigest.summaryTitle ||
            `${digest.total} 封邮件，${digest.urgentImportant} 封紧急重要，${digest.upcomingCount} 个近期事项`,
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

  return (
    <header className="glass-panel sticky top-2 z-30 rounded-[1.5rem] px-3 py-2.5 sm:px-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalmButton type="button" onClick={onMenuToggle} variant="ghost" className="h-10 w-10 rounded-2xl p-0 md:hidden" aria-label={copy.menu}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </CalmButton>

          <div className="flex min-w-0 items-center gap-2">
            <BrandLogo
              showText
              imageClassName="h-8 w-8"
              textClassName="hidden text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-subtle)] sm:inline"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[color:var(--ink)]" title={activeSource?.name || activeSource?.emailHint || copy.noMailbox}>
                {activeSource?.name || activeSource?.emailHint || copy.noMailbox}
              </p>
              <p className="truncate text-[11px] text-[color:var(--ink-subtle)]">
                {user?.displayName || user?.email || copy.notLoggedIn}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-1.5 lg:flex">
            <CalmPill tone={activeSource?.ready ? "info" : "warning"}>{sourceStatusLabel}</CalmPill>
            <CalmPill
              tone={
                notificationStreamStatus === "connected"
                  ? "success"
                  : notificationStreamStatus === "error"
                    ? "urgent"
                    : "warning"
              }
              pulse={notificationStreamStatus === "connected"}
            >
              {streamStatusLabel}
            </CalmPill>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AnimatedThemeToggle label={copy.toggleTheme} />

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

          <CalmButton
            type="button"
            onClick={handleRefresh}
            disabled={isLoadingMail || isPollingNotifications}
            aria-label={copy.refresh}
            variant="secondary"
            className="h-10 w-10 rounded-2xl p-0"
          >
            <span className={isLoadingMail || isPollingNotifications ? "animate-spin" : ""}>
              <RefreshIcon />
            </span>
          </CalmButton>

          <CalmButton
            type="button"
            onClick={handleLogout}
            aria-label={copy.logout}
            variant="ghost"
            className="h-10 w-10 rounded-2xl p-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.75A1.75 1.75 0 0 0 14 4h-7A1.75 1.75 0 0 0 5.25 5.75v12.5C5.25 19.22 6.03 20 7 20h7a1.75 1.75 0 0 0 1.75-1.75V15M12 12h8m0 0-2.5-2.5M20 12l-2.5 2.5" />
            </svg>
          </CalmButton>
        </div>
      </div>
    </header>
  );
}
