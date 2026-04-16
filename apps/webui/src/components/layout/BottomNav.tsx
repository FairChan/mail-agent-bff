import type { ViewKey, AuthLocale } from "../../types";
import { viewLabelsByLocale, viewItems } from "../../types";
import { HomeIcon, ChartIcon, CalendarIcon, SettingsIcon } from "../shared/Icons";

interface BottomNavProps {
  currentView: ViewKey;
  authLocale: AuthLocale;
  t?: (key: string) => string;
  onViewChange: (view: ViewKey) => void;
}

export function BottomNav({ currentView, authLocale, t = (k: string) => k, onViewChange }: BottomNavProps) {
  const viewLabels = viewLabelsByLocale[authLocale];
  const navLabel = t("common.mainNavigation");

  const getShortcutLabel = (action: string) => {
    const actionMap: Record<string, string> = {
      inbox: viewLabels.inbox.label,
      stats: viewLabels.stats.label,
      calendar: viewLabels.calendar.label,
      settings: viewLabels.settings.label,
      closeSidebar: t("common.closeSidebar"),
    };
    return actionMap[action] || action;
  };

  const shortcuts = [
    { key: "Ctrl+1", action: "inbox" },
    { key: "Ctrl+2", action: "stats" },
    { key: "Ctrl+3", action: "calendar" },
    { key: "Ctrl+4", action: "settings" },
    { key: "Esc", action: "closeSidebar" },
  ];

  return (
    <nav
      aria-label={navLabel}
      role="tablist"
      className="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-2xl border border-white/70 bg-white/92 p-1 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur lg:hidden"
    >
      {viewItems.map((item) => {
        const active = currentView === item.key;
        const icon =
          item.key === "inbox" ? (
            <HomeIcon />
          ) : item.key === "stats" ? (
            <ChartIcon />
          ) : item.key === "calendar" ? (
            <CalendarIcon />
          ) : (
            <SettingsIcon />
          );

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={viewLabels[item.key].label}
            onClick={() => onViewChange(item.key)}
            className={`inline-flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl py-2 text-[11px] font-medium transition ${
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {icon}
            <span className="mt-0.5 truncate">{viewLabels[item.key].short}</span>
          </button>
        );
      })}

      {/* 快捷键提示浮层 */}
      <div className="group relative ml-auto flex items-center">
        <button
          type="button"
          aria-label={t("common.showShortcuts")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          onMouseEnter={() => {}}
          onFocus={() => {}}
        >
          <span className="text-sm">⌨</span>
        </button>
        <div
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 hidden w-48 rounded-xl border border-zinc-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-900/95"
        >
          <div className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
            {t("common.shortcuts")}
          </div>
          <div className="space-y-1">
            {shortcuts.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                <span>{getShortcutLabel(s.action)}</span>
                <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-800">{s.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
