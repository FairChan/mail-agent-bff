/**
 * 设置视图
 * 使用 MailContext 和 AuthContext 管理设置
 * 包含 Microsoft Outlook 直连授权功能
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useMail } from "../../contexts/MailContext";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
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

  return (
    <div className="space-y-6">
      {/* 用户信息 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">账户信息</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">邮箱</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">昵称</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user?.displayName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">语言</span>
            <select
              value={locale}
              onChange={(e) => handleLocaleChange(e.target.value as "zh" | "en" | "ja")}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-700"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-4 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          退出登录
        </button>
      </section>

      {/* Microsoft Outlook 直连授权 */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/10">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              直接登录 Microsoft Outlook
            </h3>
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-400">
              点击后会跳转到微软官方登录页，完成授权后自动返回并创建邮箱数据源，不再依赖 Composio 中转。
            </p>

            <button
              onClick={handleMicrosoftAuth}
              disabled={isAuthenticating}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAuthenticating ? (
                <>
                  <LoadingSpinner size="sm" />
                  初始化授权中...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  登录 Microsoft Outlook
                </>
              )}
            </button>

            {authInfo && (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{authInfo}</p>
            )}
            {authError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{authError}</p>
            )}
          </div>
        </div>
      </section>

      {/* 数据源管理 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">邮件数据源</h3>
          <button
            onClick={() => fetchSources()}
            disabled={isLoadingSources}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
          >
            {isLoadingSources ? <LoadingSpinner size="sm" /> : "刷新"}
          </button>
        </div>

        {isLoadingSources && sources.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => {
              const isActive = source.id === activeSourceId;
              return (
                <div
                  key={source.id}
                  className="rounded-xl border border-zinc-200 px-3 py-3 dark:border-zinc-700"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{source.name}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {source.emailHint || source.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        source.ready
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}>
                        {source.ready ? "就绪" : "待验证"}
                      </span>
                      {isActive && (
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-white dark:bg-zinc-700">
                          当前
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {!isActive && (
                      <button
                        onClick={() => handleSelectSource(source.id)}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      onClick={() => handleVerifySource(source.id)}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400"
                    >
                      验证
                    </button>
                    {source.id !== "default_outlook" && (
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sources.length === 0 && !isLoadingSources && (
          <p className="py-4 text-center text-sm text-zinc-500">暂无数据源，请使用上方按钮授权 Outlook</p>
        )}
      </section>

      {/* 添加数据源 */}
      {allowLegacyComposioSource && (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">高级：手动添加数据源</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          这个入口保留给需要手动维护 Composio 路由参数的场景。常规使用优先上方的 Microsoft 直连按钮。
        </p>

        <div className="mt-3 grid gap-2">
          <input
            type="text"
            value={newSourceLabel}
            onChange={(e) => setNewSourceLabel(e.target.value)}
            placeholder="数据源名称（如：学校邮箱）"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          <input
            type="text"
            value={newMailboxUserId}
            onChange={(e) => setNewMailboxUserId(e.target.value)}
            placeholder="mailboxUserId（例如邮箱地址）"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          <input
            type="text"
            value={newConnectedAccountId}
            onChange={(e) => setNewConnectedAccountId(e.target.value)}
            placeholder="connectedAccountId（Composio 授权后获得）"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          <button
            onClick={handleAddSource}
            disabled={isCreating || !newSourceLabel.trim() || !newMailboxUserId.trim() || !newConnectedAccountId.trim()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-700"
          >
            {isCreating ? <LoadingSpinner size="sm" /> : "添加并验证"}
          </button>
        </div>
      </section>
      )}

      {/* 通知设置 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">通知设置</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          当前设置只作用于选中的邮箱数据源，紧急邮件和每日摘要会通过 App 内通知与浏览器桌面提醒送达。
        </p>

        <div className="mt-4 rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">当前数据源</p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {activeSource?.name || activeSource?.emailHint || "未连接邮箱"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                notificationStreamStatus === "connected"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : notificationStreamStatus === "connecting"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : notificationStreamStatus === "error"
                      ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              }`}>
                {notificationStreamStatus === "connected"
                  ? "实时已连接"
                  : notificationStreamStatus === "connecting"
                    ? "实时连接中"
                    : notificationStreamStatus === "error"
                      ? "实时异常"
                      : "等待连接"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                desktopPermission === "granted"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : desktopPermission === "denied"
                    ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              }`}>
                {desktopPermission === "granted"
                  ? "桌面提醒已开启"
                  : desktopPermission === "denied"
                    ? "桌面提醒已阻止"
                    : desktopPermission === "default"
                      ? "桌面提醒未授权"
                      : "浏览器不支持"}
              </span>
            </div>
          </div>

          {notificationStreamError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {notificationStreamError}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">紧急邮件即时提醒</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                紧急重要邮件到达后，立即进入通知中心并触发桌面提醒。
              </p>
            </div>
            <input
              type="checkbox"
              checked={urgentPushEnabled}
              onChange={(event) => {
                setUrgentPushEnabled(event.target.checked);
                markNotificationDirty();
              }}
              disabled={!notificationPrefsReady}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-600"
            />
          </label>

          <label className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">每日摘要</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                将当天邮件总览、紧急项和近期 DDL 在固定时间汇总推送。
              </p>
            </div>
            <input
              type="checkbox"
              checked={dailyDigestEnabled}
              onChange={(event) => {
                setDailyDigestEnabled(event.target.checked);
                markNotificationDirty();
              }}
              disabled={!notificationPrefsReady}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-600"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              <span>摘要时间</span>
              <input
                type="time"
                value={digestTimeValue}
                aria-label="摘要时间"
                onChange={(event) => {
                  setDigestTimeValue(event.target.value);
                  markNotificationDirty();
                }}
                disabled={!notificationPrefsReady || !dailyDigestEnabled}
                className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
              />
            </label>

            <div className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              <span>摘要时区</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={digestTimeZone}
                  aria-label="摘要时区"
                  onChange={(event) => {
                    setDigestTimeZone(event.target.value);
                    markNotificationDirty();
                  }}
                  disabled={!notificationPrefsReady || !dailyDigestEnabled}
                  placeholder="例如 Asia/Shanghai"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleUseBrowserTimeZone}
                  disabled={!notificationPrefsReady || !dailyDigestEnabled}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
                >
                  使用浏览器时区
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-50 px-3 py-3 text-xs text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
            {!notificationPrefsReady ? (
              <span className="mb-1 block text-zinc-500 dark:text-zinc-400">
                正在加载当前邮箱源的通知设置...
              </span>
            ) : null}
            {digestScheduleSummary}
            {notificationPrefs?.updatedAt ? (
              <span className="mt-1 block text-zinc-400 dark:text-zinc-500">
                最近更新：{new Date(notificationPrefs.updatedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveNotificationSettings}
              disabled={!activeSourceId || !notificationPrefsReady || isSavingNotifications || !notificationDirty}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700"
            >
              {isSavingNotifications ? <LoadingSpinner size="sm" /> : null}
              保存通知设置
            </button>
            <button
              type="button"
              onClick={handleResetNotificationSettings}
              disabled={!notificationPrefsReady || !notificationDirty}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
            >
              撤销未保存更改
            </button>
            <button
              type="button"
              onClick={handleEnableDesktopNotifications}
              disabled={!notificationPrefsReady || desktopPermission === "granted" || desktopPermission === "unsupported"}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
            >
              开启桌面提醒
            </button>
          </div>
        </div>
      </section>

      {/* 错误和成功提示 */}
      {sourceError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {sourceError}
        </div>
      )}
      {sourceInfo && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          {sourceInfo}
        </div>
      )}
      {notificationInfo && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          {notificationInfo}
        </div>
      )}
      {notificationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {notificationError}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
