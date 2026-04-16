/**
 * 顶部栏
 * 使用 AuthContext 和 MailContext
 */

import React, { useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { useTheme } from "../../contexts/ThemeContext";
import { RefreshIcon } from "../shared/Icons";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { locale, setLocale } = useApp();
  const { activeSourceId, sources, fetchTriage, fetchInsights, isLoadingMail } = useMail();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const activeSource = sources.find((s) => s.id === activeSourceId);

  const handleRefresh = useCallback(() => {
    if (activeSourceId) {
      fetchTriage(50);
      fetchInsights(50, 7);
    }
  }, [activeSourceId, fetchTriage, fetchInsights]);

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

          {/* 刷新按钮 */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoadingMail}
            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <span className={isLoadingMail ? "animate-spin" : ""}>
              <RefreshIcon />
            </span>
            刷新
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
