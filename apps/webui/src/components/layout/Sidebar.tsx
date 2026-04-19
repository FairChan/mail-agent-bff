import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ViewKey } from "@mail-agent/shared-types";
import { useApp } from "../../contexts/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { useMail } from "../../contexts/MailContext";
import { cn } from "../../lib/utils";
import { CalmButton, CalmPill, CalmSurface } from "../ui/Calm";

interface SidebarProps {
  onClose?: () => void;
}

const EXPANDED_WIDTH = 224;
const COLLAPSED_WIDTH = 64;

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
      <CalmSurface
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-mail-dialog-title"
        className="relative z-10 w-full max-w-md p-6"
        beam
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="connect-mail-dialog-title" className="text-lg font-semibold text-[color:var(--ink)]">连接邮箱</p>
            <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
              优先使用 Microsoft 直连，底层会继续走当前已验证的邮箱链路。
            </p>
          </div>
          <CalmButton type="button" onClick={onClose} variant="ghost" className="h-10 w-10 rounded-2xl p-0" aria-label="关闭连接邮箱弹窗">
            <CloseIcon />
          </CalmButton>
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onOutlookLogin}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] p-4 text-left transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <MailIcon active />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[color:var(--ink)]">Microsoft Outlook</p>
              <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                跳转微软官方登录页，授权后自动回到当前产品。
              </p>
            </div>
            <CalmPill tone="info">{busy ? "连接中" : "直连"}</CalmPill>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-muted)] p-4 text-left transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-soft)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]">
              <SettingsIcon active />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[color:var(--ink)]">高级设置</p>
              <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                进入设置页管理数据源、通知、语言和主题。
              </p>
            </div>
          </button>
        </div>

        {info ? (
          <p className="mt-4 rounded-[1.1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-4 py-3 text-xs text-[color:var(--pill-success-ink)]">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-[1.1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-xs text-[color:var(--pill-urgent-ink)]">
            {error}
          </p>
        ) : null}
      </CalmSurface>
    </div>
  );
}

export function Sidebar({ onClose }: SidebarProps) {
  const {
    setCurrentView,
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
          "relative z-20 flex h-full flex-col overflow-hidden border-r border-[color:var(--border-soft)] backdrop-blur-2xl transition-all duration-300",
          collapsed
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.12))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(245,248,252,0.18))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]"
        )}
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        role="navigation"
        aria-label="导航菜单"
      >
        <div className={cn("flex h-16 items-center border-b border-[color:var(--border-soft)]", collapsed ? "justify-center px-0" : "px-3")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]">
            <BrandIcon />
          </div>
          {!collapsed ? (
            <div className="ml-2.5 min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[color:var(--ink)]">Mery</p>
              <p className="truncate text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
                Mail Intelligence
              </p>
            </div>
          ) : null}
          {!isMobile ? (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
                collapsed ? "ml-0 mt-1" : "ml-1"
              )}
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          ) : null}
        </div>

        <div className={cn("border-b border-[color:var(--border-soft)] py-3", collapsed ? "px-1" : "px-2")}>
          {!collapsed ? (
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink-subtle)]">
                邮箱账户
              </span>
              <button
                type="button"
                onClick={() => {
                  setConnectError(null);
                  setConnectInfo(null);
                  setShowAccountModal(true);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
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
                      ? "bg-[color:var(--surface-info)] text-[color:var(--pill-info-ink)] shadow-[var(--shadow-soft)]"
                      : "text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
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
                      <p className={cn("truncate text-sm font-medium", isActive ? "text-[color:var(--pill-info-ink)]" : "text-[color:var(--ink)]")}>
                        {source.name || source.emailHint || source.id}
                      </p>
                      <p className="truncate text-[10px] text-[color:var(--ink-subtle)]">
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
                "flex items-center gap-2.5 rounded-xl py-2 text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
                collapsed ? "justify-center px-2" : "px-2"
              )}
              title={collapsed ? "连接邮箱" : undefined}
              aria-label="连接邮箱"
            >
              <div className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[color:var(--border-info)] text-[color:var(--pill-info-ink)]", collapsed ? "h-9 w-9" : "h-8 w-8")}>
                <PlusIcon />
              </div>
              {!collapsed ? <span className="text-sm">连接邮箱</span> : null}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1" />

        <div className={cn("border-t border-[color:var(--border-soft)] px-2 py-3", collapsed ? "space-y-2" : "space-y-3")}>
          {!collapsed ? (
            <div className="calm-panel px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">当前邮箱</p>
              <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ink)]">{currentSourceLabel}</p>
              <p className="mt-1 truncate text-[11px] text-[color:var(--ink-subtle)]">{user?.displayName || user?.email || "未登录"}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => handleViewChange("settings")}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
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
              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-[color:var(--pill-urgent-ink)] transition hover:bg-[color:var(--surface-urgent)]",
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
