import React, { useEffect, useMemo, useRef, useState } from "react";
import { viewItems, viewLabelsByLocale, type ViewKey } from "@mail-agent/shared-types";
import { useApp } from "../../contexts/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { useMail } from "../../contexts/MailContext";
import { cn } from "../../lib/utils";

interface SidebarProps {
  onClose?: () => void;
}

const EXPANDED_WIDTH = 224;
const COLLAPSED_WIDTH = 64;

const NAV_ICON_BY_VIEW: Record<ViewKey, (active: boolean) => React.ReactNode> = {
  tutorial: (active) => <GuideIcon active={active} />,
  inbox: (active) => <InboxIcon active={active} />,
  allmail: (active) => <MailIcon active={active} />,
  agent: (active) => <AgentIcon active={active} />,
  stats: (active) => <KnowledgeIcon active={active} />,
  knowledgebase: (active) => <KnowledgeIcon active={active} />,
  calendar: (active) => <CalendarIcon active={active} />,
  settings: (active) => <SettingsIcon active={active} />,
};

function AccountActionModal({
  open,
  busy,
  error,
  info,
  onClose,
  onOutlookLogin,
  onOpenSettings,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  info: string | null;
  onClose: () => void;
  onOutlookLogin: () => void;
  onOpenSettings: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
      );

    const frame = window.requestAnimationFrame(() => {
      getFocusableElements()[0]?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-mail-dialog-title"
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/60 bg-white/92 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/92"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="connect-mail-dialog-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">连接邮箱</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              优先使用 Microsoft 直连，底层会继续走当前已验证的邮箱链路。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            aria-label="关闭连接邮箱弹窗"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onOutlookLogin}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-left transition hover:border-blue-300 hover:bg-blue-100/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/60 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <MailIcon active />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Microsoft Outlook</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                跳转微软官方登录页，授权后自动回到当前产品。
              </p>
            </div>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{busy ? "连接中" : "直连"}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/90 p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-100/90 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <SettingsIcon active />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">高级设置</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                进入设置页管理数据源、通知、语言和主题。
              </p>
            </div>
          </button>
        </div>

        {info ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Sidebar({ onClose }: SidebarProps) {
  const {
    currentView,
    setCurrentView,
    locale,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    isMobile,
  } = useApp();
  const { user, logout } = useAuth();
  const { activeSourceId, sources, selectSource, fetchSources, launchOutlookAuth } = useMail();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectInfo, setConnectInfo] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );

  const collapsed = !isMobile && sidebarCollapsed;
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const viewLabels = viewLabelsByLocale[locale];
  const currentSourceLabel = activeSource?.name || activeSource?.emailHint || "未连接邮箱";

  const handleViewChange = (view: ViewKey) => {
    setCurrentView(view);
    onClose?.();
  };

  const handleSourceSwitch = async (sourceId: string) => {
    if (sourceId === activeSourceId) {
      return;
    }
    await selectSource(sourceId);
    onClose?.();
  };

  const handleLogout = async () => {
    if (confirm("确定要退出登录吗？")) {
      await logout();
    }
  };

  const handleOutlookLogin = async () => {
    setConnectBusy(true);
    setConnectError(null);
    setConnectInfo(null);
    try {
      const result = await launchOutlookAuth(false);
      await fetchSources();
      setConnectInfo(result.message || "Outlook 已连接，新的邮箱源已经同步回侧边栏。");
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "连接 Outlook 失败");
    } finally {
      setConnectBusy(false);
    }
  };

  return (
    <>
      <aside
        className={cn(
          "relative z-20 flex h-full flex-col overflow-hidden border-r border-sky-200/35 backdrop-blur-2xl transition-all duration-300 dark:border-sky-400/15",
          collapsed
            ? "bg-sky-400/12 dark:bg-sky-950/35"
            : "bg-gradient-to-br from-sky-400/14 via-sky-300/10 to-indigo-400/10 dark:from-sky-950/45 dark:via-indigo-950/35 dark:to-purple-950/30"
        )}
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        role="navigation"
        aria-label="导航菜单"
      >
        <div className={cn("flex h-14 items-center border-b border-blue-200/30 dark:border-blue-400/15", collapsed ? "justify-center px-0" : "px-3")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-white/70 dark:bg-white/8 dark:ring-white/10">
            <BrandIcon />
          </div>
          {!collapsed ? (
            <div className="ml-2.5 min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-blue-950 dark:text-blue-50">Mery</p>
              <p className="truncate text-[10px] uppercase tracking-[0.18em] text-blue-500/80 dark:text-blue-200/60">
                Mail Intelligence
              </p>
            </div>
          ) : null}
          {!isMobile ? (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-blue-500 transition hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300",
                collapsed ? "ml-0 mt-1" : "ml-1"
              )}
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          ) : null}
        </div>

        <div className={cn("border-b border-blue-200/30 py-2 dark:border-blue-400/15", collapsed ? "px-1" : "px-2")}>
          {!collapsed ? (
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-500/70 dark:text-blue-300/60">
                邮箱账户
              </span>
              <button
                type="button"
                onClick={() => {
                  setConnectError(null);
                  setConnectInfo(null);
                  setShowAccountModal(true);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-blue-500/70 transition hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
                aria-label="添加邮箱账户"
              >
                <PlusIcon />
              </button>
            </div>
          ) : null}

          <div className={cn("space-y-0.5", collapsed ? "flex flex-col items-center" : "")}>
            {sources.map((source) => {
              const isActive = source.id === activeSourceId;
              const initials = getInitials(source.name || source.emailHint || source.id);
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => void handleSourceSwitch(source.id)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all",
                    collapsed ? "justify-center" : "w-full",
                    isActive
                      ? "bg-blue-100/70 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                      : "text-blue-900/80 hover:bg-blue-50 dark:text-blue-100/80 dark:hover:bg-blue-950/35"
                  )}
                  title={collapsed ? source.name || source.emailHint || source.id : undefined}
                  aria-label={isActive ? `当前邮箱源：${source.name || source.emailHint || source.id}` : `切换邮箱源：${source.name || source.emailHint || source.id}`}
                >
                  <div className={cn("relative flex shrink-0 items-center justify-center", collapsed ? "h-9 w-9" : "h-8 w-8")}>
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white">
                      {initials}
                    </div>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-zinc-950",
                        source.ready ? "bg-emerald-500" : "bg-amber-500"
                      )}
                    />
                  </div>

                  {!collapsed ? (
                    <div className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm font-medium", isActive ? "text-blue-700 dark:text-blue-300" : "text-blue-950 dark:text-blue-50")}>
                        {source.name || source.emailHint || source.id}
                      </p>
                      <p className="truncate text-[10px] text-blue-600/60 dark:text-blue-200/55">
                        {source.emailHint || source.id}
                      </p>
                    </div>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setConnectError(null);
                setConnectInfo(null);
                setShowAccountModal(true);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-xl py-2 text-blue-500/75 transition hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300",
                collapsed ? "justify-center px-2" : "px-2"
              )}
              title={collapsed ? "连接邮箱" : undefined}
              aria-label="连接邮箱"
            >
              <div className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-blue-300 text-blue-500 dark:border-blue-600", collapsed ? "h-9 w-9" : "h-8 w-8")}>
                <PlusIcon />
              </div>
              {!collapsed ? <span className="text-sm">连接邮箱</span> : null}
            </button>
          </div>
        </div>

        <div className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-1" : "px-2")}>
          {!collapsed ? (
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-500/70 dark:text-blue-300/60">
              导航
            </p>
          ) : null}
          <div className="space-y-1">
            {viewItems.map((item) => {
              const isActive = currentView === item.key;
              const icon = NAV_ICON_BY_VIEW[item.key]?.(isActive) ?? <InboxIcon active={isActive} />;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleViewChange(item.key)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all",
                    collapsed ? "justify-center" : "w-full",
                    isActive
                      ? "bg-blue-100/70 text-blue-700 shadow-sm dark:bg-blue-950/70 dark:text-blue-300"
                      : "text-blue-900/80 hover:bg-blue-50 dark:text-blue-100/80 dark:hover:bg-blue-950/35"
                  )}
                  title={collapsed ? viewLabels[item.key].label : undefined}
                  aria-label={viewLabels[item.key].label}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">{icon}</div>
                  {!collapsed ? (
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium">{viewLabels[item.key].label}</p>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn("border-t border-blue-200/30 px-2 py-3 dark:border-blue-400/15", collapsed ? "space-y-2" : "space-y-3")}>
          {!collapsed ? (
            <div className="rounded-2xl border border-white/70 bg-white/72 px-3 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">当前邮箱</p>
              <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{currentSourceLabel}</p>
              <p className="mt-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{user?.displayName || user?.email || "未登录"}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => handleViewChange("settings")}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-zinc-700 transition hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5",
              collapsed ? "justify-center" : "w-full"
            )}
            title={collapsed ? "账户中心" : undefined}
            aria-label="账户中心"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <SettingsIcon active={false} />
            </div>
            {!collapsed ? <span className="text-sm font-medium">账户中心</span> : null}
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20",
              collapsed ? "justify-center" : "w-full"
            )}
            title={collapsed ? "退出登录" : undefined}
            aria-label="退出登录"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <LogoutIcon />
            </div>
            {!collapsed ? <span className="text-sm font-medium">退出登录</span> : null}
          </button>
        </div>
      </aside>

      <AccountActionModal
        open={showAccountModal}
        busy={connectBusy}
        error={connectError}
        info={connectInfo}
        onClose={() => setShowAccountModal(false)}
        onOutlookLogin={() => void handleOutlookLogin()}
        onOpenSettings={() => {
          setShowAccountModal(false);
          handleViewChange("settings");
        }}
      />
    </>
  );
}

function getInitials(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return "ME";
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length > 1) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function BrandIcon() {
  return (
    <svg className="h-5 w-5 text-blue-700 dark:text-blue-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 7 5a2 2 0 0 0 2 0l7-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function InboxIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H4z" />
      <path d="M4 13h4l2 3h4l2-3h4" />
    </svg>
  );
}

function MailIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m21 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L3 7" />
    </svg>
  );
}

function AgentIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="M7 8h10a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4Z" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
      <path d="M9 18c.8.64 1.8 1 3 1s2.2-.36 3-1" />
    </svg>
  );
}

function KnowledgeIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2.5" />
      <path d="m4.93 4.93 1.77 1.77" />
      <path d="M2 12h2.5" />
      <path d="m4.93 19.07 1.77-1.77" />
      <path d="M12 19.5V22" />
      <path d="m17.3 17.3 1.77 1.77" />
      <path d="M19.5 12H22" />
      <path d="m17.3 6.7 1.77-1.77" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function GuideIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M12 4h9" />
      <path d="M4 9h16" />
      <path d="M4 15h8" />
      <path d="M4 4h2" />
      <path d="M4 20h2" />
    </svg>
  );
}
