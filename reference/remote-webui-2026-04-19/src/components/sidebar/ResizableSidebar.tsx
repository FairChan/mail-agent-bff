"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "../../lib/utils";

export type AccountProvider = "outlook" | "gmail" | "icloud" | "yahoo" | "custom";

export interface Account {
  id: string;
  provider: AccountProvider;
  email: string;
  displayName: string;
  unreadCount: number;
  lastSync: Date | null;
  ready: boolean;
}

interface ResizableSidebarProps {
  accounts: Account[];
  activeAccountId: string | null;
  onSwitchAccount: (id: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (id: string) => void;
  activeNav: string;
  onNavChange: (nav: string) => void;
  devMode: boolean;
  onToggleDevMode: () => void;
  onLogout: () => void;
}

const NAV_ITEMS: Array<{ id: string; labelKey: string; icon: typeof HomeIcon }> = [
  { id: "home", labelKey: "nav.home", icon: HomeIcon },
  { id: "stats", labelKey: "nav.stats", icon: BarChartIcon },
  { id: "calendar", labelKey: "nav.calendar", icon: CalendarIcon },
  { id: "settings", labelKey: "nav.settings", icon: SettingsIcon },
];

const PROVIDER_COLORS: Record<AccountProvider, string> = {
  outlook: "from-blue-600 to-blue-500",
  gmail: "from-red-500 to-orange-400",
  icloud: "from-slate-500 to-slate-400",
  yahoo: "from-purple-600 to-indigo-500",
  custom: "from-zinc-500 to-zinc-400",
};

function getInitials(name: string, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function formatLastSync(date: Date | null, t: TFunction): string {
  if (!date) return t("sidebar.notSynced");
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("sidebar.justNow");
  if (min < 60) return t("sidebar.minutesAgo", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("sidebar.hoursAgo", { count: hr });
  return t("sidebar.daysAgo", { count: Math.floor(hr / 24) });
}

const EXPANDED_W = 220;
const COLLAPSED_W = 64;

export function ResizableSidebar({
  accounts,
  activeAccountId,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  activeNav,
  onNavChange,
  devMode,
  onToggleDevMode,
  onLogout,
  collapsed,
  onToggleCollapse,
}: ResizableSidebarProps & { collapsed: boolean; onToggleCollapse: () => void }) {
  const { t } = useTranslation();
  const [hoveredAccountId, setHoveredAccountId] = useState<string | null>(null);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const sidebarW = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col backdrop-blur-xl transition-all duration-300",
        collapsed
          ? "w-16 border-r border-sky-200/30 bg-sky-500/10 dark:border-sky-400/20 dark:bg-sky-900/30"
          : "w-56 border-r border-sky-200/30 bg-gradient-to-br from-sky-400/15 via-sky-300/10 to-indigo-400/10 backdrop-blur-xl dark:border-sky-400/20 dark:from-sky-900/40 dark:via-indigo-900/30 dark:to-purple-900/30",
        collapsed ? "items-center" : ""
      )}
      style={{ width: sidebarW, minWidth: sidebarW, maxWidth: sidebarW }}
    >
      {/* ── Top: Logo / Brand + Collapse Toggle ── */}
      <div className={cn(
        "flex h-14 items-center border-b border-blue-200/30 dark:border-blue-400/20",
        collapsed ? "justify-center px-0" : "px-3"
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <LogoIcon className="h-7 w-7 text-blue-700 dark:text-blue-200" />
        </div>
        {!collapsed && (
          <div className="ml-2.5 min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-blue-900 dark:text-blue-50">{t("sidebar.brand")}</p>
          </div>
        )}
        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300",
            collapsed ? "ml-0 mt-1" : "ml-1"
          )}
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>

      {/* ── Accounts Section ── */}
      <div className={cn(
        "border-b border-blue-200/30 py-2 transition-all dark:border-blue-400/20",
        collapsed ? "w-full px-1" : "px-2"
      )}>
        {!collapsed && (
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500/70 dark:text-blue-400/70">{t("sidebar.accounts")}</span>
            <button
              onClick={onAddAccount}
              className="flex h-5 w-5 items-center justify-center rounded text-blue-500/70 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
              title={t("sidebar.addAccount")}
            >
              <PlusIcon />
            </button>
          </div>
        )}

        <div className={cn("space-y-0.5", collapsed ? "flex flex-col items-center" : "")}>
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            const isHovered = account.id === hoveredAccountId;
            return (
              <div key={account.id} className="relative">
                <button
                  onClick={() => onSwitchAccount(account.id)}
                  onMouseEnter={() => setHoveredAccountId(account.id)}
                  onMouseLeave={() => setHoveredAccountId(null)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all",
                    collapsed
                      ? "justify-center"
                      : "w-full",
                    isActive
                      ? "bg-blue-100/60 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                      : "text-blue-800/80 hover:bg-blue-50 dark:text-blue-200/80 dark:hover:bg-blue-950/40"
                  )}
                  title={collapsed ? `${account.displayName || account.email}` : undefined}
                >
                  {/* Avatar */}
                  <div className={cn("relative flex shrink-0 items-center justify-center", collapsed ? "h-9 w-9" : "h-8 w-8")}>
                    <div className={cn("flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white", PROVIDER_COLORS[account.provider])}>
                      {getInitials(account.displayName, account.email)}
                    </div>
                    {account.unreadCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                        {account.unreadCount > 99 ? "99+" : account.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  {!collapsed && (
                    <div className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm font-medium", isActive ? "text-blue-700 dark:text-blue-300" : "text-blue-900 dark:text-blue-100")}>
                        {account.displayName || account.email.split("@")[0]}
                      </p>
                      <p className="truncate text-[10px] text-blue-600/60 dark:text-blue-300/60">{account.email}</p>
                    </div>
                  )}
                </button>

                {/* Hover remove button */}
                {(isHovered) && !collapsed && (
                  <div className="absolute right-1 top-1/2 z-30 -translate-y-1/2 rounded-lg border border-blue-200/50 bg-white/95 shadow-lg dark:border-blue-400/30 dark:bg-blue-950/95">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveAccount(account.id); }}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <TrashIcon /> {t("sidebar.remove")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add account button */}
          <button
            onClick={onAddAccount}
            className={cn(
              "flex items-center gap-2.5 rounded-xl py-2 text-blue-500/70 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/50 dark:hover:text-blue-300",
              collapsed ? "justify-center px-2" : "px-2"
            )}
            title={collapsed ? t("sidebar.addAccount") : undefined}
          >
            <div className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-blue-300 text-blue-500 dark:border-blue-600", collapsed ? "h-9 w-9" : "h-8 w-8")}>
              <PlusIcon />
            </div>
            {!collapsed && <span className="text-sm">{t("sidebar.addAccount")}</span>}
          </button>
        </div>

        {/* ── Navigation ── */}
        {!collapsed && (
          <div className="mt-2 border-t border-blue-200/30 py-2 dark:border-blue-400/20">
            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavChange(item.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 transition-all",
                    isActive
                      ? "bg-blue-100/70 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
                      : "text-blue-800/80 hover:bg-blue-50 dark:text-blue-200/80 dark:hover:bg-blue-950/40"
                  )}
                  title={t(item.labelKey)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                    <Icon active={isActive} />
                  </div>
                  <span className="truncate text-sm font-medium">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Active account status */}
        {!collapsed && activeAccount && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-blue-200/40 bg-blue-50/60 px-2 py-1.5 dark:border-blue-400/30 dark:bg-blue-950/60">
            <div className={cn("h-1.5 w-1.5 rounded-full", activeAccount.ready ? "bg-emerald-500" : "bg-blue-400")} />
            <span className="truncate text-[10px] text-blue-600/70 dark:text-blue-300/70">
              {activeAccount.ready ? t("sidebar.ready") + " · " : t("sidebar.notReady") + " · "}{formatLastSync(activeAccount.lastSync, t)}
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom: Logout ── */}
      {!collapsed && (
        <div className="border-t border-blue-200/30 px-2 py-2 dark:border-blue-400/20">
          {/* Logout */}
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-blue-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          >
            <LogOutIcon />
            <span className="text-sm">{t("settings.logout")}</span>
          </button>
        </div>
      )}

      {/* Collapsed: only logout */}
      {collapsed && (
        <div className="border-t border-blue-200/30 py-2 dark:border-blue-400/20">
          <button
            onClick={onLogout}
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-blue-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            title={t("settings.logout")}
          >
            <LogOutIcon />
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BarChartIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PlusIcon() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}

function ChevronLeftIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>;
}

function ChevronRightIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>;
}

function LogOutIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}

// ── Logo Icon ────────────────────────────────────────────────────────────────────

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Left curved arrow (mirrored) */}
      <path
        d="M8 24 L8 12 Q8 6 14 6 L14 6 Q20 6 20 12 L20 24"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Top horizontal lines connecting both sides */}
      <path
        d="M10 10 L22 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 6 L20 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

