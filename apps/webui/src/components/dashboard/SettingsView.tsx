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
import { CalmButton, CalmPill, CalmSectionLabel, CalmSurface } from "../ui/Calm";
import { formatImapConnectionError, formatOauthConnectionError } from "../../utils/mailConnectionFeedback";

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
    providers,
    activeSourceId,
    isLoadingSources,
    fetchSources,
    fetchProviders,
    addSource,
    connectImapSource,
    selectSource,
    deleteSource,
    verifySource,
    launchOutlookAuth,
    launchGmailAuth,
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
  const [imapProvider, setImapProvider] = useState<"gmail" | "icloud" | "netease163" | "qq" | "aliyun" | "custom_imap">("gmail");
  const [imapLabel, setImapLabel] = useState("");
  const [imapEmail, setImapEmail] = useState("");
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");
  const [imapSecure, setImapSecure] = useState(true);
  const [isConnectingImap, setIsConnectingImap] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGmailAuthenticating, setIsGmailAuthenticating] = useState(false);
  const [gmailAuthInfo, setGmailAuthInfo] = useState<string | null>(null);
  const [gmailAuthError, setGmailAuthError] = useState<string | null>(null);
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
  const imapProviders = useMemo(
    () => providers.filter((provider) => provider.connectionTypes.includes("imap_password") && provider.id !== "outlook"),
    [providers]
  );
  const selectedImapProvider = imapProviders.find((provider) => provider.id === imapProvider);

  useEffect(() => {
    if (selectedImapProvider?.imap && !imapHost.trim()) {
      setImapHost(selectedImapProvider.imap.host);
      setImapPort(String(selectedImapProvider.imap.port));
      setImapSecure(selectedImapProvider.imap.secure);
    }
  }, [imapHost, selectedImapProvider]);

  const digestScheduleSummary = useMemo(() => {
    if (!dailyDigestEnabled) {
      return locale === "zh" ? "每日摘要已关闭。" : "Daily digest is disabled.";
    }

    return locale === "zh"
      ? `每日摘要会按 ${digestTimeZone} 的 ${digestTimeValue} 投递到 App 与浏览器提醒。`
      : `Daily digest is delivered at ${digestTimeValue} in ${digestTimeZone}.`;
  }, [dailyDigestEnabled, digestTimeValue, digestTimeZone, locale]);

  useEffect(() => {
    fetchProviders();
    fetchSources();
  }, [fetchProviders, fetchSources]);

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
      setAuthError(formatOauthConnectionError("outlook", err));
    } finally {
      setIsAuthenticating(false);
    }
  }, [launchOutlookAuth, fetchSources]);

  const handleGmailAuth = useCallback(async () => {
    setIsGmailAuthenticating(true);
    setGmailAuthError(null);
    setGmailAuthInfo(null);

    try {
      const result = await launchGmailAuth();
      if (result.mailboxUserIdHint) {
        setImapEmail(result.mailboxUserIdHint);
        setImapUsername(result.mailboxUserIdHint);
      }
      if (result.account?.email) {
        setImapProvider("gmail");
        setImapLabel(`Gmail ${result.account.email}`);
      }
      setGmailAuthInfo(result.message || "Google Gmail 已连接，邮箱数据源已返回。");
      void fetchSources();
    } catch (err) {
      setGmailAuthError(formatOauthConnectionError("gmail", err));
    } finally {
      setIsGmailAuthenticating(false);
    }
  }, [fetchSources, launchGmailAuth]);

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

  const handleConnectImap = useCallback(async () => {
    if (!imapEmail.trim()) {
      setSourceError("请输入邮箱地址");
      return;
    }
    if (!imapPassword.trim()) {
      setSourceError("请输入授权码或应用专用密码");
      return;
    }

    setIsConnectingImap(true);
    setSourceError(null);
    setSourceInfo(null);
    try {
      const connected = await connectImapSource({
        provider: imapProvider,
        label: imapLabel.trim() || undefined,
        email: imapEmail.trim(),
        username: imapUsername.trim() || imapEmail.trim(),
        appPassword: imapPassword.trim(),
        imapHost: imapHost.trim() || undefined,
        imapPort: imapPort.trim() ? Number(imapPort) : undefined,
        imapSecure,
      });
      setSourceInfo(`${connected?.name ?? "IMAP 邮箱"} 已连接，系统会按现有邮件预处理流程读取收件箱。`);
      setImapLabel("");
      setImapEmail("");
      setImapUsername("");
      setImapPassword("");
    } catch (err) {
      setSourceError(formatImapConnectionError(err));
    } finally {
      setIsConnectingImap(false);
    }
  }, [
    connectImapSource,
    imapEmail,
    imapHost,
    imapLabel,
    imapPassword,
    imapPort,
    imapProvider,
    imapSecure,
    imapUsername,
  ]);

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
      <CalmSurface tone="info" beam className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <CalmSectionLabel>{locale === "zh" ? "Control Center" : locale === "ja" ? "コントロールセンター" : "Control Center"}</CalmSectionLabel>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ink)]">{copy.title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--ink-subtle)]">{copy.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={notificationStreamStatus === "connected" ? "success" : notificationStreamStatus === "error" ? "danger" : "warning"}>
              {streamStatusLabel}
            </StatusPill>
            <StatusPill tone={desktopPermission === "granted" ? "success" : desktopPermission === "denied" ? "danger" : "neutral"}>
              {desktopPermissionLabel}
            </StatusPill>
          </div>
        </div>
      </CalmSurface>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <nav className="space-y-2">
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
                className={`flex w-full items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-left text-sm font-medium transition-all ${
                  activeSection === section.id
                    ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)] text-[color:var(--ink)] shadow-[var(--shadow-soft)]"
                    : "border-transparent text-[color:var(--ink-subtle)] hover:border-[color:var(--border-soft)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
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
                  <CalmButton
                    type="button"
                    onClick={handleLogout}
                    className="min-h-11 border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] text-[color:var(--pill-urgent-ink)] hover:bg-[color:var(--surface-urgent)]"
                  >
                    <LogoutMiniIcon />
                    {locale === "zh" ? "退出登录" : locale === "ja" ? "ログアウト" : "Log out"}
                  </CalmButton>
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
                    <CalmButton
                      type="button"
                      onClick={handleMicrosoftAuth}
                      disabled={isAuthenticating}
                      variant="primary"
                      className="mt-3"
                    >
                      {isAuthenticating ? <LoadingSpinner size="sm" /> : <MailNavIcon />}
                      {locale === "zh" ? "登录 Microsoft Outlook" : locale === "ja" ? "Microsoft Outlook にログイン" : "Connect Outlook"}
                    </CalmButton>
                    {authInfo ? <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{authInfo}</p> : null}
                    {authError ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{authError}</p> : null}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "Google Gmail 直连" : locale === "ja" ? "Google Gmail 直結" : "Google Gmail Direct"}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white">
                    <MailNavIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {locale === "zh" ? "跳转 Google 官方登录页，授权后自动回到当前产品。当前先提供 Gmail 邮件读取直连。" : locale === "ja" ? "Google 公式ログインへ遷移し、認可後に自動で戻ります。現状は Gmail メール読取の直結です。" : "Jump to the official Google sign-in flow and return automatically. This direct path currently enables Gmail mail read access."}
                    </p>
                    <CalmButton
                      type="button"
                      onClick={handleGmailAuth}
                      disabled={isGmailAuthenticating}
                      variant="secondary"
                      className="mt-3"
                    >
                      {isGmailAuthenticating ? <LoadingSpinner size="sm" /> : <MailNavIcon />}
                      {locale === "zh" ? "登录 Google Gmail" : locale === "ja" ? "Google Gmail にログイン" : "Connect Gmail"}
                    </CalmButton>
                    {gmailAuthInfo ? <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{gmailAuthInfo}</p> : null}
                    {gmailAuthError ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{gmailAuthError}</p> : null}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "多邮箱 IMAP 接入" : locale === "ja" ? "マルチメール IMAP 接続" : "Multi-Mail IMAP"}>
                <div className="space-y-4">
                  <p className="text-sm text-[color:var(--ink-muted)]">
                    {locale === "zh"
                      ? "Gmail 现在优先推荐上面的 Google 直连；Apple iCloud、163、QQ、阿里邮箱仍然使用官方 IMAP + 授权码接入。IMAP 负责读取邮件；日历写入会在对应 OAuth/Calendar API 接好后开启。"
                      : locale === "ja"
                        ? "Gmail は上の Google 直結を優先し、iCloud、163、QQ、Ali Mail は IMAP とアプリパスワードでメール読取を接続します。"
                        : "Gmail now prefers the direct Google OAuth path above, while iCloud, 163, QQ, and Ali Mail continue to use official IMAP with an app password or authorization code."}
                  </p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                      <span>{locale === "zh" ? "邮箱类型" : "Provider"}</span>
                      <select
                        value={imapProvider}
                        onChange={(event) => {
                          const nextProvider = event.target.value as typeof imapProvider;
                          setImapProvider(nextProvider);
                          const descriptor = imapProviders.find((provider) => provider.id === nextProvider);
                          setImapHost(descriptor?.imap?.host ?? "");
                          setImapPort(descriptor?.imap?.port ? String(descriptor.imap.port) : "");
                          setImapSecure(descriptor?.imap?.secure ?? true);
                        }}
                        className="calm-input h-11"
                      >
                        {(imapProviders.length > 0 ? imapProviders : [
                          { id: "gmail", label: "Gmail" },
                          { id: "icloud", label: "Apple iCloud Mail" },
                          { id: "netease163", label: "网易 163 邮箱" },
                          { id: "qq", label: "QQ 邮箱" },
                          { id: "aliyun", label: "阿里邮箱" },
                          { id: "custom_imap", label: "Custom IMAP" },
                        ]).map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                      <span>{locale === "zh" ? "显示名称" : "Label"}</span>
                      <input
                        type="text"
                        value={imapLabel}
                        onChange={(event) => setImapLabel(event.target.value)}
                        placeholder={selectedImapProvider ? `${selectedImapProvider.label} name@example.com` : "Mail source label"}
                        className="calm-input h-11"
                      />
                    </label>

                    <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                      <span>{locale === "zh" ? "邮箱地址" : "Email"}</span>
                      <input
                        type="email"
                        value={imapEmail}
                        onChange={(event) => setImapEmail(event.target.value)}
                        placeholder="name@example.com"
                        className="calm-input h-11"
                      />
                    </label>

                    <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                      <span>{locale === "zh" ? "用户名" : "Username"}</span>
                      <input
                        type="text"
                        value={imapUsername}
                        onChange={(event) => setImapUsername(event.target.value)}
                        placeholder={locale === "zh" ? "默认使用邮箱地址" : "Defaults to email address"}
                        className="calm-input h-11"
                      />
                    </label>

                    <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                      <span>{locale === "zh" ? "授权码 / 应用专用密码" : "App password / authorization code"}</span>
                      <input
                        type="password"
                        value={imapPassword}
                        onChange={(event) => setImapPassword(event.target.value)}
                        placeholder={locale === "zh" ? "不会发送给大模型，仅本地加密保存" : "Encrypted locally, never sent to the model"}
                        className="calm-input h-11"
                      />
                    </label>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_7rem]">
                      <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                        <span>IMAP Host</span>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={(event) => setImapHost(event.target.value)}
                          placeholder="imap.example.com"
                          className="calm-input h-11"
                        />
                      </label>
                      <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                        <span>Port</span>
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(event) => setImapPort(event.target.value)}
                          placeholder="993"
                          className="calm-input h-11"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--ink-muted)] shadow-[var(--shadow-inset)]">
                    <div className="grid gap-1">
                      <span>{locale === "zh" ? "使用 SSL/TLS 加密连接" : "Use SSL/TLS"}</span>
                      <span className="text-xs text-[color:var(--ink-subtle)]">
                        {locale === "zh"
                          ? "当前版本强制开启 TLS，避免授权码通过明文 IMAP 发送。"
                          : "TLS is mandatory in the current rollout so app passwords never travel over plaintext IMAP."}
                      </span>
                    </div>
                    <span className="rounded-full border border-emerald-400/35 bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-200">
                      TLS
                    </span>
                  </div>

                  {selectedImapProvider?.notes.length ? (
                    <div className="rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-xs text-[color:var(--ink-subtle)] shadow-[var(--shadow-inset)]">
                      {selectedImapProvider.notes[0]}
                    </div>
                  ) : null}

                  <CalmButton
                    type="button"
                    onClick={handleConnectImap}
                    disabled={isConnectingImap || !imapEmail.trim() || !imapPassword.trim()}
                    variant="primary"
                    className="h-11"
                  >
                    {isConnectingImap ? <LoadingSpinner size="sm" /> : <MailNavIcon />}
                    {locale === "zh" ? "连接 IMAP 邮箱" : locale === "ja" ? "IMAP メールを接続" : "Connect IMAP mailbox"}
                  </CalmButton>
                </div>
              </SettingsCard>

              <SettingsCard title={locale === "zh" ? "邮箱源管理" : locale === "ja" ? "メールソース管理" : "Mail Sources"}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-[color:var(--ink-subtle)]">
                    {locale === "zh" ? "切换默认邮箱、验证连接状态，并保留多账号管理能力。" : locale === "ja" ? "既定ソースの切り替えと複数アカウント管理。" : "Switch defaults, verify readiness, and keep multi-source control."}
                  </p>
                  <CalmButton
                    type="button"
                    onClick={() => fetchSources()}
                    disabled={isLoadingSources}
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                  >
                    {isLoadingSources ? <LoadingSpinner size="sm" /> : locale === "zh" ? "刷新" : locale === "ja" ? "更新" : "Refresh"}
                  </CalmButton>
                </div>

                <div className="space-y-3">
                  {sources.length === 0 && !isLoadingSources ? (
                    <div className="rounded-[1.25rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--ink-subtle)]">
                      {locale === "zh" ? "暂无数据源，请先完成 Outlook 授权。" : locale === "ja" ? "メールソースがありません。先に Outlook 認可を完了してください。" : "No mail sources yet. Connect Outlook first."}
                    </div>
                  ) : null}

                  {sources.map((source) => {
                    const isActive = source.id === activeSourceId;
                    return (
                      <div key={source.id} className="rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 shadow-[var(--shadow-inset)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{source.name}</p>
                            <p className="mt-1 truncate text-xs text-[color:var(--ink-subtle)]">{source.emailHint || source.id}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-subtle)]">
                              {source.provider} · {source.connectionType ?? "unknown"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill tone={source.ready ? "success" : "warning"}>{source.ready ? copy.ready : copy.pending}</StatusPill>
                            {isActive ? (
                              <StatusPill tone="neutral">{copy.current}</StatusPill>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {!isActive ? (
                            <CalmButton
                              type="button"
                              onClick={() => handleSelectSource(source.id)}
                              variant="secondary"
                              className="px-3 py-1.5 text-xs"
                            >
                              {locale === "zh" ? "设为默认" : locale === "ja" ? "既定にする" : "Set default"}
                            </CalmButton>
                          ) : null}
                          <CalmButton
                            type="button"
                            onClick={() => handleVerifySource(source.id)}
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                          >
                            {locale === "zh" ? "验证" : locale === "ja" ? "確認" : "Verify"}
                          </CalmButton>
                          {source.id !== "default_outlook" ? (
                            <CalmButton
                              type="button"
                              onClick={() => handleDeleteSource(source.id)}
                              className="border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-3 py-1.5 text-xs text-[color:var(--pill-urgent-ink)] hover:bg-[color:var(--surface-urgent)]"
                            >
                              {locale === "zh" ? "删除" : locale === "ja" ? "削除" : "Delete"}
                            </CalmButton>
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
                      className="calm-input h-11"
                    />
                    <input
                      type="text"
                      value={newMailboxUserId}
                      onChange={(e) => setNewMailboxUserId(e.target.value)}
                      placeholder="mailboxUserId"
                      className="calm-input h-11"
                    />
                    <input
                      type="text"
                      value={newConnectedAccountId}
                      onChange={(e) => setNewConnectedAccountId(e.target.value)}
                      placeholder="connectedAccountId"
                      className="calm-input h-11"
                    />
                    <CalmButton
                      type="button"
                      onClick={handleAddSource}
                      disabled={isCreating || !newSourceLabel.trim() || !newMailboxUserId.trim() || !newConnectedAccountId.trim()}
                      variant="primary"
                      className="h-11"
                    >
                      {isCreating ? <LoadingSpinner size="sm" /> : locale === "zh" ? "添加并验证" : locale === "ja" ? "追加して確認" : "Add and verify"}
                    </CalmButton>
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
                      <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 shadow-[var(--shadow-inset)]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[color:var(--ink)]">{source.name}</p>
                          <p className="mt-1 truncate text-xs text-[color:var(--ink-subtle)]">{source.emailHint || source.id}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {isActive ? (
                            <StatusPill tone={source.ready ? "success" : "warning"}>{copy.current}</StatusPill>
                          ) : (
                            <CalmButton
                              type="button"
                              onClick={() => handleSelectSource(source.id)}
                              variant="secondary"
                              className="px-3 py-1.5 text-xs"
                            >
                              {locale === "zh" ? "设为默认" : locale === "ja" ? "既定にする" : "Set default"}
                            </CalmButton>
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
                    <label htmlFor="settings-digest-time" className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
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
                        className="calm-input h-11 disabled:opacity-60"
                      />
                    </label>

                    <div className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
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
                          className="calm-input h-11 min-w-0 flex-1 disabled:opacity-60"
                        />
                        <CalmButton
                          type="button"
                          onClick={handleUseBrowserTimeZone}
                          disabled={!notificationPrefsReady || !dailyDigestEnabled}
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                        >
                          {locale === "zh" ? "使用浏览器时区" : locale === "ja" ? "ブラウザ時区を使用" : "Use browser timezone"}
                        </CalmButton>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-xs text-[color:var(--ink-muted)]">
                    {!notificationPrefsReady ? (
                      <span className="mb-1 block text-[color:var(--ink-subtle)]">
                        {locale === "zh" ? "正在加载当前邮箱源的通知设置..." : locale === "ja" ? "現在のソース設定を読み込み中..." : "Loading notification preferences for the active source..."}
                      </span>
                    ) : null}
                    {digestScheduleSummary}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <CalmButton
                      type="button"
                      onClick={handleSaveNotificationSettings}
                      disabled={!activeSourceId || !notificationPrefsReady || isSavingNotifications || !notificationDirty}
                      variant="primary"
                    >
                      {isSavingNotifications ? <LoadingSpinner size="sm" /> : null}
                      {locale === "zh" ? "保存通知设置" : locale === "ja" ? "通知設定を保存" : "Save notification settings"}
                    </CalmButton>
                    <CalmButton
                      type="button"
                      onClick={handleResetNotificationSettings}
                      disabled={!notificationPrefsReady || !notificationDirty}
                      variant="secondary"
                    >
                      {locale === "zh" ? "撤销未保存更改" : locale === "ja" ? "未保存の変更を戻す" : "Reset unsaved changes"}
                    </CalmButton>
                    <CalmButton
                      type="button"
                      onClick={handleEnableDesktopNotifications}
                      disabled={!notificationPrefsReady || desktopPermission === "granted" || desktopPermission === "unsupported"}
                      variant="secondary"
                    >
                      {locale === "zh" ? "开启桌面提醒" : locale === "ja" ? "デスクトップ通知を有効化" : "Enable desktop alerts"}
                    </CalmButton>
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
                      className={`flex flex-col items-center gap-2 rounded-[1.25rem] border-2 p-3 transition-all ${
                        theme === themeOption.id
                          ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)]"
                          : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)]"
                      }`}
                    >
                      <div className={`h-8 w-full rounded-lg border ${themeOption.preview}`} />
                      <span className="text-xs font-medium text-[color:var(--ink-muted)]">{themeOption.label}</span>
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
                      className={`flex w-full items-center justify-between rounded-[1.25rem] border px-4 py-3 text-sm font-medium transition-all ${
                        locale === lang.code
                          ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)] text-[color:var(--ink)]"
                          : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-elevated)]"
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
                <ul className="space-y-2 text-sm text-[color:var(--ink-muted)]">
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
    <CalmSurface tone="default" beam className="px-5 py-5">
      <h3 className="mt-2 text-base font-semibold text-[color:var(--ink)]">{title}</h3>
      <div className="mt-4">{children}</div>
    </CalmSurface>
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
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 shadow-[var(--shadow-inset)]">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[color:var(--ink)]">{label}</p>
        <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{description}</p>
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
              ? "bg-[color:var(--button-primary)]"
              : "bg-[color:var(--pill-muted)]",
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
    <CalmPill tone={mapTone(tone)} className="px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
      {children}
    </CalmPill>
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
    <CalmSurface tone={mapTone(tone)} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-subtle)]">{label}</p>
          <p className="mt-2 break-words text-sm font-semibold text-[color:var(--ink)]">{value}</p>
          {detail ? <p className="mt-1 break-words text-xs text-[color:var(--ink-subtle)]">{detail}</p> : null}
        </div>
        <StatusPill tone={tone}>{tone}</StatusPill>
      </div>
    </CalmSurface>
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
        "rounded-[1.25rem] border px-4 py-3 text-xs",
        tone === "success" && "border-[color:var(--border-success)] bg-[color:var(--surface-success)] text-[color:var(--ink)]",
        tone === "danger" && "border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] text-[color:var(--ink)]",
        tone === "neutral" && "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)]"
      )}
    >
      {children}
    </div>
  );
}

function mapTone(tone: "neutral" | "success" | "warning" | "danger") {
  if (tone === "success") {
    return "success" as const;
  }
  if (tone === "warning") {
    return "warning" as const;
  }
  if (tone === "danger") {
    return "urgent" as const;
  }
  return "muted" as const;
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
