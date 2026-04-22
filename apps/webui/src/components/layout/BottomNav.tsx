import type { ViewKey, AuthLocale } from "../../types";
import { viewLabelsByLocale, viewItems } from "../../types";
import { HomeIcon, ChartIcon, CalendarIcon, SettingsIcon } from "../shared/Icons";

interface BottomNavProps {
  currentView: ViewKey;
  authLocale: AuthLocale;
  t?: (key: string) => string;
  onViewChange: (view: ViewKey) => void;
}

function TutorialIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15.5A2.5 2.5 0 0 0 16.5 16H5Z" />
      <path d="M7 7h8M7 10.5h8M7 14h5" />
      <path d="M5 5.5V19a2 2 0 0 0 2 2h12" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="7" width="14" height="10" rx="3" />
      <path d="M12 3v3M9 11.5h.01M15 11.5h.01M9.5 15c.8.67 1.64 1 2.5 1s1.7-.33 2.5-1" />
    </svg>
  );
}

export function BottomNav({ currentView, authLocale, t = (k: string) => k, onViewChange }: BottomNavProps) {
  const viewLabels = viewLabelsByLocale[authLocale];
  const navLabel = t("common.mainNavigation");
  const bottomItems = viewItems.filter((item) => item.key !== "knowledgebase");

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
      className="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-[1.4rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] p-1.5 shadow-[0_14px_32px_rgba(18,27,45,0.12)] backdrop-blur-sm lg:hidden"
    >
      {bottomItems.map((item) => {
        const active =
          currentView === item.key || (currentView === "knowledgebase" && item.key === "stats");
        const icon =
          item.key === "tutorial" ? (
            <TutorialIcon />
          ) : item.key === "inbox" ? (
            <HomeIcon />
          ) : item.key === "allmail" ? (
            <MailIcon />
          ) : item.key === "agent" ? (
            <AgentIcon />
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
            className={`inline-flex min-w-0 flex-1 flex-col items-center justify-center rounded-[1rem] px-2 py-2 text-[11px] font-medium transition ${
              active
                ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)] shadow-[var(--shadow-soft)]"
                : "text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
            }`}
          >
            {icon}
            <span className="mt-1 truncate">{viewLabels[item.key].short}</span>
          </button>
        );
      })}

      <div className="group relative ml-auto flex items-center">
        <button
          type="button"
          aria-label={t("common.showShortcuts")}
          className="flex h-9 w-9 items-center justify-center rounded-[0.9rem] text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
        >
          <span className="text-sm">⌨</span>
        </button>
        <div
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 hidden w-52 rounded-[1rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] p-3 text-xs shadow-[var(--shadow-soft)] backdrop-blur-sm group-hover:block group-focus-within:block"
        >
          <div className="mb-2 font-medium text-[color:var(--ink)]">{t("common.shortcuts")}</div>
          <div className="space-y-1.5">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between gap-2 text-[color:var(--ink-muted)]"
              >
                <span>{getShortcutLabel(shortcut.action)}</span>
                <kbd className="rounded-md border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--ink)]">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
