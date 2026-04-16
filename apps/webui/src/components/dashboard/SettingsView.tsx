/**
 * 设置视图
 * 使用 MailContext 和 AuthContext 管理设置
 * 包含 Composio Outlook 授权功能
 */

import React, { useState, useCallback, useEffect } from "react";
import { useMail } from "../../contexts/MailContext";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
import { LoadingSpinner } from "../shared/LoadingSpinner";

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

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // ========== Composio Outlook 授权 ==========

  const handleComposioAuth = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    setAuthInfo(null);

    try {
      const result = await launchOutlookAuth(false);

      if (result.mailboxUserIdHint) {
        setNewMailboxUserId(result.mailboxUserIdHint);
      }
      if (result.connectedAccountId) {
        setNewConnectedAccountId(result.connectedAccountId);
      }

      if (result.hasActiveConnection) {
        setAuthInfo("Outlook 已通过 Composio 连接，已帮你预填授权信息。");
        await fetchSources();
        return;
      }

      if (result.redirectUrl) {
        // 打开 Outlook 授权桥接页面，该页面会引导用户完成 Composio 授权
        const bridgeUrl = `/outlook-auth-bridge.html?redirectUrl=${encodeURIComponent(result.redirectUrl)}&t=${Date.now()}`;
        window.open(bridgeUrl, "_blank", "noopener,noreferrer");
        setAuthInfo("授权页面已打开，请在 Composio 授权完成后返回。");
      } else {
        setAuthError("未能获取授权跳转地址，请稍后重试。");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "授权失败";
      if (msg.includes("401") || msg.includes("Unauthorized")) {
        setAuthError("会话已过期，请重新登录后重试。");
      } else if (msg.includes("503") || msg.includes("Composio")) {
        setAuthError("Composio 服务未正确配置，请在 OpenClaw 中检查 Composio consumer key 设置。");
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

      {/* Composio Outlook 授权（核心新功能） */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/10">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              通过 Composio 连接 Outlook
            </h3>
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-400">
              使用 Composio 进行 OAuth 授权，安全连接你的 Outlook 邮箱。授权后即可使用邮件分类、洞察等功能。
            </p>

            <button
              onClick={handleComposioAuth}
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
                  授权 Outlook 邮箱
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
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">手动添加数据源</h3>

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

      {/* 通知设置 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">通知设置</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          紧急邮件和每日摘要将通过 Outlook 推送通知
        </p>
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
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
