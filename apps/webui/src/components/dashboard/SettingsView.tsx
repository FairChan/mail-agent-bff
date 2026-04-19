/**
 * 设置视图
 * 使用 MailContext 和 AuthContext 管理设置
 * 包含 Microsoft Outlook 直连授权功能
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useMail } from "../../contexts/MailContext";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
import { useTheme } from "../../contexts/ThemeContext";
import { cn } from "../../lib/utils";
import { LoadingSpinner } from "../shared/LoadingSpinner";

function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

function toTimeInputValue(hour: number, minute: number): string {
  return `${padTime(hour)}:${padTime(minute)}`;
}

function fromTimeInputValue(value: string): { hour: number; minute: number } {
  const [hourText = "20", minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 20,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
}

export function SettingsView() {
  const {
    sources,
    activeSourceId,
    isLoadingSources,
    fetchSources,
    addSource,
    selectSource,
    deleteSource,
    verifySource,
    launchOutlookAuth,
    notificationPrefs,
    fetchNotificationPrefs,
    updateNotificationPrefs,
    notificationStreamStatus,
    notificationStreamError,
    error,
  } = useMail();
  const { user, updatePreferences, logout } = useAuth();
  const { locale, setLocale } = useApp();
  const { theme, setTheme } = useTheme();

  const [newSourceLabel, setNewSourceLabel] = useState("");
  const [newMailboxUserId, setNewMailboxUserId] = useState("");
  const [newConnectedAccountId, setNewConnectedAccountId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceInfo, setSourceInfo] = useState<string | null>(null);
  const [urgentPushEnabled, setUrgentPushEnabled] = useState(true);
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(true);
  const [digestTimeValue, setDigestTimeValue] = useState("20:00");
  const [digestTimeZone, setDigestTimeZone] = useState("Asia/Shanghai");
  const [notificationDirty, setNotificationDirty] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationInfo, setNotificationInfo] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"account" | "mail" | "notifications" | "appearance" | "about">("notifications");
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const allowLegacyComposioSource = import.meta.env.VITE_ENABLE_LEGACY_COMPOSIO === "true";
  const activeSource = sources.find((source) => source.id === activeSourceId) ?? null;
  const notificationPrefsReady = !activeSourceId || notificationPrefs !== null;

  const digestScheduleSummary = useMemo(() => {
    if (!dailyDigestEnabled) {
      return locale === "zh" ? "每日摘要已关闭。" : "Daily digest is disabled.";
    }

    return locale === "zh"
      ? `每日摘要会按 ${digestTimeZone} 的 ${digestTimeValue} 投递到 App 与浏览器提醒。`
      : `Daily digest is delivered at ${digestTimeValue} in ${digestTimeZone}.`;
  }, [dailyDigestEnabled, digestTimeValue, digestTimeZone, locale]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.Notification === "undefined") {
      setDesktopPermission("unsupported");
      return;
    }

    setDesktopPermission(window.Notification.permission);
  }, []);

  useEffect(() => {
    if (!activeSourceId) {
      setNotificationDirty(false);
      setNotificationInfo(null);
      setNotificationError(null);
      return;
    }

    const fallbackTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
    setUrgentPushEnabled(true);
    setDailyDigestEnabled(true);
    setDigestTimeValue("20:00");
    setDigestTimeZone(fallbackTimeZone);
    setNotificationDirty(false);
    setNotificationInfo(null);
    setNotificationError(null);
    void fetchNotificationPrefs();
  }, [activeSourceId, fetchNotificationPrefs]);

  useEffect(() => {
    if (!notificationPrefs) {
      return;
    }

    setUrgentPushEnabled(notificationPrefs.urgentPushEnabled);
    setDailyDigestEnabled(notificationPrefs.dailyDigestEnabled);
    setDigestTimeValue(toTimeInputValue(notificationPrefs.digestHour, notificationPrefs.digestMinute));
    setDigestTimeZone(notificationPrefs.digestTimeZone);
    setNotificationDirty(false);
  }, [notificationPrefs, activeSourceId]);

  // ========== Microsoft Outlook 直连授权 ==========

  const handleMicrosoftAuth = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    setAuthInfo(null);

    try {
      const result = await launchOutlookAuth(false);

      if (result.mailboxUserIdHint) {
        setNewMailboxUserId(result.mailboxUserIdHint);
      }
      if (result.account?.email) {
        setNewSourceLabel(`Outlook ${result.account.email}`);
      }
      setAuthInfo(result.message || "Microsoft Outlook 已连接，邮箱数据源已返回。");
      void fetchSources();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "授权失败";
      if (msg.includes("401") || msg.includes("Unauthorized")) {
        setAuthError("会话已过期，请重新登录后重试。");
      } else if (msg.includes("MICROSOFT_OAUTH_NOT_CONFIGURED") || msg.includes("MICROSOFT_CLIENT_ID")) {
        setAuthError("Microsoft OAuth 尚未配置，请先在 BFF 环境变量中填写客户端信息。");
      } else {
        setAuthError(`授权失败: ${msg}`);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, [launchOutlookAuth, fetchSources]);

  // ========== 数据源管理 ==========

  const handleAddSource = useCallback(async () => {
    if (!newSourceLabel.trim()) {
      setSourceError("请输入数据源名称");
      return;
    }

    setIsCreating(true);
    setSourceError(null);

    try {
      if (!newMailboxUserId.trim() || !newConnectedAccountId.trim()) {
        setSourceError("手动添加需要同时填写 mailboxUserId 和 connectedAccountId");
        return;
      }

      await addSource(newSourceLabel, newMailboxUserId || undefined, newConnectedAccountId || undefined);
      setSourceInfo("数据源添加成功");
      setNewSourceLabel("");
      setNewMailboxUserId("");
      setNewConnectedAccountId("");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setIsCreating(false);
    }
  }, [newSourceLabel, newMailboxUserId, newConnectedAccountId, addSource]);

  const handleSelectSource = useCallback(async (sourceId: string) => {
    try {
      await selectSource(sourceId);
      setSourceInfo("已切换为默认数据源");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "切换失败");
    }
  }, [selectSource]);

  const handleVerifySource = useCallback(async (sourceId: string) => {
    try {
      const ready = await verifySource(sourceId);
      setSourceInfo(ready ? "验证成功" : "验证失败");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "验证失败");
    }
  }, [verifySource]);

  const handleDeleteSource = useCallback(async (sourceId: string) => {
    if (!confirm("确定要删除此数据源吗？")) return;

    try {
      await deleteSource(sourceId);
      setSourceInfo("数据源已删除");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "删除失败");
    }
  }, [deleteSource]);

  const handleLocaleChange = useCallback(async (newLocale: "zh" | "en" | "ja") => {
    setLocale(newLocale);
    await updatePreferences({ locale: newLocale === "zh" ? "zh-CN" : newLocale === "en" ? "en-US" : "ja-JP" });
  }, [setLocale, updatePreferences]);

  const handleLogout = useCallback(async () => {
    if (confirm("确定要退出登录吗？")) {
      await logout();
    }
  }, [logout]);

  const markNotificationDirty = useCallback(() => {
    setNotificationDirty(true);
    setNotificationInfo(null);
    setNotificationError(null);
  }, []);

  const handleEnableDesktopNotifications = useCallback(async () => {
    if (typeof window === "undefined" || typeof window.Notification === "undefined") {
      setDesktopPermission("unsupported");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setDesktopPermission(permission);
  }, []);

  const handleUseBrowserTimeZone = useCallback(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
    setDigestTimeZone(detected);
    markNotificationDirty();
  }, [markNotificationDirty]);

  const handleResetNotificationSettings = useCallback(() => {
    if (!notificationPrefs) {
      return;
    }

    setUrgentPushEnabled(notificationPrefs.urgentPushEnabled);
    setDailyDigestEnabled(notificationPrefs.dailyDigestEnabled);
    setDigestTimeValue(toTimeInputValue(notificationPrefs.digestHour, notificationPrefs.digestMinute));
    setDigestTimeZone(notificationPrefs.digestTimeZone);
    setNotificationDirty(false);
    setNotificationInfo(null);
    setNotificationError(null);
  }, [notificationPrefs]);

  const handleSaveNotificationSettings = useCallback(async () => {
    if (!activeSourceId) {
      setNotificationError(locale === "zh" ? "请先连接并选中一个邮箱数据源。" : "Select a mail source first.");
      return;
    }

    setIsSavingNotifications(true);
    setNotificationInfo(null);
    setNotificationError(null);

    try {
      const { hour, minute } = fromTimeInputValue(digestTimeValue);
      await updateNotificationPrefs({
        urgentPushEnabled,
        dailyDigestEnabled,
        digestHour: hour,
        digestMinute: minute,
        digestTimeZone: digestTimeZone.trim() || "Asia/Shanghai",
      });
      setNotificationDirty(false);
      setNotificationInfo(locale === "zh" ? "通知设置已保存。" : "Notification settings saved.");
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : (locale === "zh" ? "保存失败" : "Failed to save settings."));
    } finally {
      setIsSavingNotifications(false);
    }
  }, [
    activeSourceId,
    dailyDigestEnabled,
    digestTimeValue,
    digestTimeZone,
    locale,
    updateNotificationPrefs,
    urgentPushEnabled,
  ]);

  const copy = useMemo(() => {
    if (locale === "ja") {
      return {
        title: "設定",
        subtitle: "アカウント、メールソース、通知、表示設定をまとめて管理します。",
        sections: {
          account: "アカウント",
          mail: "メール",
          notifications: "通知",
          appearance: "表示",
          about: "状態",
        },
        connected: "接続済み",
        notConnected: "未接続",
        current: "現在",
        ready: "準備完了",
        pending: "確認待ち",
        streamConnected: "リアルタイム接続中",
        streamConnecting: "リアルタイム接続中…",
        streamError: "リアルタイム異常",
        streamIdle: "待機中",
        desktopGranted: "デスクトップ通知オン",
        desktopDenied: "デスクトップ通知拒否",
        desktopDefault: "デスクトップ通知未許可",
        desktopUnsupported: "ブラウザ未対応",
      };
    }

    if (locale === "en") {
      return {
        title: "Settings",
        subtitle: "Manage account, mail sources, notifications, and appearance in one place.",
        sections: {
          account: "Account",
          mail: "Mail",
          notifications: "Notifications",
          appearance: "Appearance",
          about: "Status",
        },
        connected: "Connected",
        notConnected: "Not connected",
        current: "Current",
        ready: "Ready",
        pending: "Needs verification",
        streamConnected: "Realtime connected",
        streamConnecting: "Realtime connecting",
        streamError: "Realtime error",
        streamIdle: "Waiting",
        desktopGranted: "Desktop alerts enabled",
        desktopDenied: "Desktop alerts blocked",
        desktopDefault: "Desktop alerts not granted",
        desktopUnsupported: "Browser unsupported",
      };
    }

    return {
      title: "设置",
      subtitle: "把账户、邮箱源、通知和界面外观收在同一个工作台里。",
      sections: {
        account: "账户",
        mail: "邮箱",
        notifications: "通知",
        appearance: "外观",
        about: "状态",
      },
      connected: "已连接",
      notConnected: "未连接",
      current: "当前",
      ready: "就绪",
      pending: "待验证",
      streamConnected: "实时已连接",
      streamConnecting: "实时连接中",
      streamError: "实时异常",
      streamIdle: "等待连接",
      desktopGranted: "桌面提醒已开启",
      desktopDenied: "桌面提醒已阻止",
      desktopDefault: "桌面提醒未授权",
      desktopUnsupported: "浏览器不支持",
    };
  }, [locale]);

  const streamStatusLabel = useMemo(() => {
    if (notificationStreamStatus === "connected") return copy.streamConnected;
    if (notificationStreamStatus === "connecting") return copy.streamConnecting;
    if (notificationStreamStatus === "error") return copy.streamError;
    return copy.streamIdle;
  }, [copy, notificationStreamStatus]);

  const desktopPermissionLabel = useMemo(() => {
    if (desktopPermission === "granted") return copy.desktopGranted;
    if (desktopPermission === "denied") return copy.desktopDenied;
    if (desktopPermission === "default") return copy.desktopDefault;
    return copy.desktopUnsupported;
  }, [copy, desktopPermission]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{copy.subtitle}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <nav className="space-y-1">
            {([
              { id: "account", label: copy.sections.account, icon: <UserNavIcon /> },
              { id: "mail", label: copy.sections.mail, icon: <MailNavIcon /> },
              { id: "notifications", label: copy.sections.notifications, icon: <BellNavIcon /> },
              { id: "appearance", label: copy.sections.appearance, icon: <PaletteNavIcon /> },
              { id: "about", label: copy.sections.about, icon: <InfoNavIcon /> },
            ] as const).map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-all ${
                  activeSection === section.id
                    ? "bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-950/40 dark:text-blue-300"
                    : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                }`}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-4 lg:col-span-4">
          {activeSection === "account" ? (
            <>
              <SettingsCard title={locale === "zh" ? "账户信息" : locale === "ja" ? "アカウント情報" : "Account"}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                    <UserNavIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {user?.displayName || user?.email || copy.notConnected}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user?.email || "—"}</p>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {copy.connected}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "当前邮箱源" : locale === "ja" ? "現在のメールソース" : "Current Mail Source"}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {activeSource?.name || activeSource?.emailHint || copy.notConnected}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{activeSource?.id || "—"}</p>
                  </div>
                  <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    activeSource?.ready
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  }`}>
                    {activeSource?.ready ? copy.ready : copy.pending}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "账户操作" : locale === "ja" ? "アカウント操作" : "Account Actions"}>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-100 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <LogoutMiniIcon />
                    {locale === "zh" ? "退出登录" : locale === "ja" ? "ログアウト" : "Log out"}
                  </button>
                </div>
              </SettingsCard>
            </>
          ) : null}

          {activeSection === "mail" ? (
            <>
              <SettingsCard title={locale === "zh" ? "Microsoft Outlook 直连" : locale === "ja" ? "Microsoft Outlook 直結" : "Microsoft Outlook Direct"}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                    <MailNavIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {locale === "zh" ? "跳转微软官方登录页，授权后自动回到当前产品。" : locale === "ja" ? "Microsoft 公式ログインへ遷移し、認可後に自動で戻ります。" : "Jump to the official Microsoft sign-in flow and return automatically."}
                    </p>
                    <button
                      type="button"
                      onClick={handleMicrosoftAuth}
                      disabled={isAuthenticating}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAuthenticating ? <LoadingSpinner size="sm" /> : <MailNavIcon />}
                      {locale === "zh" ? "登录 Microsoft Outlook" : locale === "ja" ? "Microsoft Outlook にログイン" : "Connect Outlook"}
                    </button>
                    {authInfo ? <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{authInfo}</p> : null}
                    {authError ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{authError}</p> : null}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "邮箱源管理" : locale === "ja" ? "メールソース管理" : "Mail Sources"}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {locale === "zh" ? "切换默认邮箱、验证连接状态，并保留多账号管理能力。" : locale === "ja" ? "既定ソースの切り替えと複数アカウント管理。" : "Switch defaults, verify readiness, and keep multi-source control."}
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchSources()}
                    disabled={isLoadingSources}
                    className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    {isLoadingSources ? <LoadingSpinner size="sm" /> : locale === "zh" ? "刷新" : locale === "ja" ? "更新" : "Refresh"}
                  </button>
                </div>

                <div className="space-y-3">
                  {sources.length === 0 && !isLoadingSources ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      {locale === "zh" ? "暂无数据源，请先完成 Outlook 授权。" : locale === "ja" ? "メールソースがありません。先に Outlook 認可を完了してください。" : "No mail sources yet. Connect Outlook first."}
                    </div>
                  ) : null}

                  {sources.map((source) => {
                    const isActive = source.id === activeSourceId;
                    return (
                      <div key={source.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{source.name}</p>
                            <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{source.emailHint || source.id}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              source.ready
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                            }`}>
                              {source.ready ? copy.ready : copy.pending}
                            </span>
                            {isActive ? (
                              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                                {copy.current}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {!isActive ? (
                            <button
                              type="button"
                              onClick={() => handleSelectSource(source.id)}
                              className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
                            >
                              {locale === "zh" ? "设为默认" : locale === "ja" ? "既定にする" : "Set default"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleVerifySource(source.id)}
                            className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
                          >
                            {locale === "zh" ? "验证" : locale === "ja" ? "確認" : "Verify"}
                          </button>
                          {source.id !== "default_outlook" ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteSource(source.id)}
                              className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-950/20"
                            >
                              {locale === "zh" ? "删除" : locale === "ja" ? "削除" : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SettingsCard>

              {allowLegacyComposioSource ? (
                <SettingsCard title={locale === "zh" ? "高级：手动添加数据源" : locale === "ja" ? "高度: 手動ソース追加" : "Advanced: Manual Source"}>
                  <div className="grid gap-3">
                    <input
                      type="text"
                      value={newSourceLabel}
                      onChange={(e) => setNewSourceLabel(e.target.value)}
                      placeholder={locale === "zh" ? "数据源名称" : locale === "ja" ? "ソース名" : "Source label"}
                      className="h-11 rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <input
                      type="text"
                      value={newMailboxUserId}
                      onChange={(e) => setNewMailboxUserId(e.target.value)}
                      placeholder="mailboxUserId"
                      className="h-11 rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <input
                      type="text"
                      value={newConnectedAccountId}
                      onChange={(e) => setNewConnectedAccountId(e.target.value)}
                      placeholder="connectedAccountId"
                      className="h-11 rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddSource}
                      disabled={isCreating || !newSourceLabel.trim() || !newMailboxUserId.trim() || !newConnectedAccountId.trim()}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      {isCreating ? <LoadingSpinner size="sm" /> : locale === "zh" ? "添加并验证" : locale === "ja" ? "追加して確認" : "Add and verify"}
                    </button>
                  </div>
                </SettingsCard>
              ) : null}
            </>
          ) : null}

          {activeSection === "notifications" ? (
            <>
              <SettingsCard title={locale === "zh" ? "通知关联邮箱" : locale === "ja" ? "通知対象メール" : "Notification Mail Source"}>
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {locale === "zh"
                      ? "通知偏好会按当前邮箱源分别保存，切换默认邮箱后会自动加载对应设置。"
                      : locale === "ja"
                        ? "通知設定はメールソースごとに保存されます。"
                        : "Notification preferences are saved per mail source."}
                  </p>

                  {sources.map((source) => {
                    const isActive = source.id === activeSourceId;
                    return (
                      <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-zinc-50/75 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/45">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{source.name}</p>
                          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{source.emailHint || source.id}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {isActive ? (
                            <StatusPill tone={source.ready ? "success" : "warning"}>{copy.current}</StatusPill>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectSource(source.id)}
                              className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
                            >
                              {locale === "zh" ? "设为默认" : locale === "ja" ? "既定にする" : "Set default"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "通知状态" : locale === "ja" ? "通知状態" : "Notification Status"}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={notificationStreamStatus === "connected" ? "success" : notificationStreamStatus === "error" ? "danger" : "warning"}>
                    {streamStatusLabel}
                  </StatusPill>
                  <StatusPill tone={desktopPermission === "granted" ? "success" : desktopPermission === "denied" ? "danger" : "neutral"}>
                    {desktopPermissionLabel}
                  </StatusPill>
                </div>
                {notificationStreamError ? (
                  <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {notificationStreamError}
                  </p>
                ) : null}
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "通知设置" : locale === "ja" ? "通知設定" : "Notification Settings"}>
                <div className="space-y-4">
                  <ToggleRow
                    label={locale === "zh" ? "紧急邮件即时提醒" : locale === "ja" ? "緊急メール即時通知" : "Urgent mail push"}
                    description={locale === "zh" ? "紧急重要邮件进入通知中心并立即触发桌面提醒。" : locale === "ja" ? "緊急・重要メールを即時通知します。" : "Trigger in-app and desktop notifications for urgent-important mail."}
                    checked={urgentPushEnabled}
                    disabled={!notificationPrefsReady}
                    onChange={(checked) => {
                      setUrgentPushEnabled(checked);
                      markNotificationDirty();
                    }}
                  />
                  <ToggleRow
                    label={locale === "zh" ? "每日摘要" : locale === "ja" ? "日次ダイジェスト" : "Daily digest"}
                    description={locale === "zh" ? "固定时间推送当天总览、紧急项和近期 DDL。" : locale === "ja" ? "毎日の要約を固定時刻に配信します。" : "Send a daily overview with urgent items and upcoming deadlines."}
                    checked={dailyDigestEnabled}
                    disabled={!notificationPrefsReady}
                    onChange={(checked) => {
                      setDailyDigestEnabled(checked);
                      markNotificationDirty();
                    }}
                  />

                  <div className="grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                    <label htmlFor="settings-digest-time" className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                      <span>{locale === "zh" ? "摘要时间" : locale === "ja" ? "配信時刻" : "Digest time"}</span>
                      <input
                        id="settings-digest-time"
                        type="time"
                        value={digestTimeValue}
                        onChange={(event) => {
                          setDigestTimeValue(event.target.value);
                          markNotificationDirty();
                        }}
                        disabled={!notificationPrefsReady || !dailyDigestEnabled}
                        className="h-11 rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>

                    <div className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                      <label htmlFor="settings-digest-timezone">{locale === "zh" ? "摘要时区" : locale === "ja" ? "タイムゾーン" : "Digest timezone"}</label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          id="settings-digest-timezone"
                          type="text"
                          value={digestTimeZone}
                          onChange={(event) => {
                            setDigestTimeZone(event.target.value);
                            markNotificationDirty();
                          }}
                          disabled={!notificationPrefsReady || !dailyDigestEnabled}
                          placeholder="Asia/Shanghai"
                          className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={handleUseBrowserTimeZone}
                          disabled={!notificationPrefsReady || !dailyDigestEnabled}
                          className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          {locale === "zh" ? "使用浏览器时区" : locale === "ja" ? "ブラウザ時区を使用" : "Use browser timezone"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-950/50 dark:text-zinc-300">
                    {!notificationPrefsReady ? (
                      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">
                        {locale === "zh" ? "正在加载当前邮箱源的通知设置..." : locale === "ja" ? "現在のソース設定を読み込み中..." : "Loading notification preferences for the active source..."}
                      </span>
                    ) : null}
                    {digestScheduleSummary}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveNotificationSettings}
                      disabled={!activeSourceId || !notificationPrefsReady || isSavingNotifications || !notificationDirty}
                      className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      {isSavingNotifications ? <LoadingSpinner size="sm" /> : null}
                      {locale === "zh" ? "保存通知设置" : locale === "ja" ? "通知設定を保存" : "Save notification settings"}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetNotificationSettings}
                      disabled={!notificationPrefsReady || !notificationDirty}
                      className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      {locale === "zh" ? "撤销未保存更改" : locale === "ja" ? "未保存の変更を戻す" : "Reset unsaved changes"}
                    </button>
                    <button
                      type="button"
                      onClick={handleEnableDesktopNotifications}
                      disabled={!notificationPrefsReady || desktopPermission === "granted" || desktopPermission === "unsupported"}
                      className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      {locale === "zh" ? "开启桌面提醒" : locale === "ja" ? "デスクトップ通知を有効化" : "Enable desktop alerts"}
                    </button>
                  </div>
                </div>
              </SettingsCard>
            </>
          ) : null}

          {activeSection === "appearance" ? (
            <>
              <SettingsCard title={locale === "zh" ? "主题" : locale === "ja" ? "テーマ" : "Theme"}>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "light" as const, label: locale === "zh" ? "浅色" : locale === "ja" ? "ライト" : "Light", preview: "bg-white border-zinc-200" },
                    { id: "dark" as const, label: locale === "zh" ? "深色" : locale === "ja" ? "ダーク" : "Dark", preview: "bg-zinc-900 border-zinc-700" },
                    { id: "system" as const, label: locale === "zh" ? "跟随系统" : locale === "ja" ? "システム" : "System", preview: "bg-gradient-to-br from-white to-zinc-900 border-zinc-300" },
                  ].map((themeOption) => (
                    <button
                      key={themeOption.id}
                      type="button"
                      onClick={() => setTheme(themeOption.id)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
                        theme === themeOption.id
                          ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <div className={`h-8 w-full rounded-lg border ${themeOption.preview}`} />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{themeOption.label}</span>
                    </button>
                  ))}
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "语言" : locale === "ja" ? "言語" : "Language"}>
                <div className="space-y-2">
                  {[
                    { code: "zh" as const, label: "中文" },
                    { code: "en" as const, label: "English" },
                    { code: "ja" as const, label: "日本語" },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        void handleLocaleChange(lang.code);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${
                        locale === lang.code
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span>{lang.label}</span>
                      {locale === lang.code ? <CheckMiniIcon /> : null}
                    </button>
                  ))}
                </div>
              </SettingsCard>
            </>
          ) : null}

          {activeSection === "about" ? (
            <>
              <SettingsCard title={locale === "zh" ? "系统状态" : locale === "ja" ? "システム状態" : "System Status"}>
                <div className="grid gap-3 md:grid-cols-2">
                  <StatusPanel
                    label={locale === "zh" ? "当前源" : locale === "ja" ? "現在のソース" : "Current source"}
                    value={activeSource?.name || activeSource?.emailHint || copy.notConnected}
                    tone={activeSource?.ready ? "success" : "warning"}
                    detail={activeSource?.id || "—"}
                  />
                  <StatusPanel
                    label={locale === "zh" ? "通知流" : locale === "ja" ? "通知ストリーム" : "Notification stream"}
                    value={streamStatusLabel}
                    tone={notificationStreamStatus === "connected" ? "success" : notificationStreamStatus === "error" ? "danger" : "warning"}
                    detail={notificationStreamError || digestScheduleSummary}
                  />
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "运行备注" : locale === "ja" ? "実行メモ" : "Runtime Notes"}>
                <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <li>{digestScheduleSummary}</li>
                  <li>{error || (locale === "zh" ? "当前没有全局错误。" : locale === "ja" ? "現在グローバルエラーはありません。" : "No global errors right now.")}</li>
                  <li>
                    {notificationPrefs?.updatedAt
                      ? `${locale === "zh" ? "最近更新" : locale === "ja" ? "最終更新" : "Last updated"}: ${new Date(notificationPrefs.updatedAt).toLocaleString(locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US")}`
                      : locale === "zh"
                        ? "通知设置尚未保存。"
                        : locale === "ja"
                          ? "通知設定はまだ保存されていません。"
                          : "Notification preferences have not been saved yet."}
                  </li>
                </ul>
              </SettingsCard>
            </>
          ) : null}

          {sourceError ? <InlineMessage tone="danger">{sourceError}</InlineMessage> : null}
          {sourceInfo ? <InlineMessage tone="success">{sourceInfo}</InlineMessage> : null}
          {notificationInfo ? <InlineMessage tone="success">{notificationInfo}</InlineMessage> : null}
          {notificationError ? <InlineMessage tone="danger">{notificationError}</InlineMessage> : null}
          {error ? <InlineMessage tone="danger">{error}</InlineMessage> : null}
        </div>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/65 bg-white/82 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/72 dark:shadow-[0_18px_55px_rgba(2,6,23,0.42)]">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-zinc-200/70 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/45">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      <span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={label}
          disabled={disabled}
        />
        <span
          className={cn(
            "pointer-events-none relative inline-flex h-7 w-12 items-center rounded-full transition",
            checked
              ? "bg-blue-600 dark:bg-blue-500"
              : "bg-zinc-300 dark:bg-zinc-700",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-6" : "translate-x-1"
            )}
          />
        </span>
      </span>
    </label>
  );
}

function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
        tone === "success" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300",
        tone === "warning" && "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300",
        tone === "danger" && "bg-red-50 text-red-700 dark:bg-red-950/35 dark:text-red-300",
        tone === "neutral" && "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
      )}
    >
      {children}
    </span>
  );
}

function StatusPanel({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50/75 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">{label}</p>
          <p className="mt-2 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
          {detail ? <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-400">{detail}</p> : null}
        </div>
        <StatusPill tone={tone}>{tone}</StatusPill>
      </div>
    </div>
  );
}

function InlineMessage({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-xs",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
        tone === "danger" && "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
        tone === "neutral" && "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300"
      )}
    >
      {children}
    </div>
  );
}

function UserNavIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function MailNavIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" />
    </svg>
  );
}

function BellNavIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 17a2 2 0 0 0 4 0" />
    </svg>
  );
}

function PaletteNavIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 1 0 0 18h1.2a2.8 2.8 0 0 0 0-5.6H12a1.9 1.9 0 0 1 0-3.8h2.8A4.2 4.2 0 0 0 19 7.4 4.4 4.4 0 0 0 14.6 3z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InfoNavIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5" />
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LogoutMiniIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 4v16" />
    </svg>
  );
}

function CheckMiniIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4.2 4.2L19 6.5" />
    </svg>
  );
}
