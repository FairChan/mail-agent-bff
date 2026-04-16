/**
 * 侧边栏
 * 使用 AppContext 和 MailContext
 */

import React, { useMemo } from "react";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { viewLabelsByLocale, viewItems, type ViewKey } from "@mail-agent/shared-types";

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { currentView, setCurrentView, locale } = useApp();
  const { activeSourceId, sources } = useMail();

  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeSourceId) ?? null,
    [sources, activeSourceId]
  );

  const viewLabels = viewLabelsByLocale[locale];

  const handleViewChange = (view: ViewKey) => {
    setCurrentView(view);
    onClose?.();
  };

  return (
    <aside
      className="glass-panel flex h-full flex-col bg-white/80 dark:bg-zinc-900/80"
      role="navigation"
      aria-label="导航菜单"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-4 dark:border-zinc-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Mery</span>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          导航
        </p>
        <div className="space-y-1">
          {viewItems.map((item) => {
            const isActive = currentView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleViewChange(item.key)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {viewLabels[item.key].label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 当前数据源 */}
      <div className="border-t border-zinc-200 px-3 py-4 dark:border-zinc-700">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          当前数据源
        </p>
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-800/80">
          {activeSource ? (
            <>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{activeSource.name}</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {activeSource.emailHint || activeSource.id}
              </p>
              <p className="mt-2 flex items-center gap-1 text-xs">
                <span className={`h-2 w-2 rounded-full ${
                  activeSource.ready
                    ? "bg-emerald-500"
                    : "bg-amber-500"
                }`} />
                <span className="text-zinc-600 dark:text-zinc-400">
                  {activeSource.ready ? "已连接" : "待验证"}
                </span>
              </p>
            </>
          ) : (
            <p className="text-xs text-zinc-500">未连接</p>
          )}
        </div>
      </div>
    </aside>
  );
}
