import React, { useCallback, useRef, useState } from "react";
import { viewItems, viewLabelsByLocale, type AuthLocale, type ViewKey } from "@mail-agent/shared-types";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

type AppDockProps = {
  currentView: ViewKey;
  locale: AuthLocale;
  onViewChange: (view: ViewKey) => void;
};

const DOCK_ICON_BY_VIEW: Record<ViewKey, React.ReactNode> = {
  tutorial: <GuideIcon />,
  inbox: <InboxIcon />,
  allmail: <MailIcon />,
  agent: <AgentIcon />,
  stats: <KnowledgeIcon />,
  knowledgebase: <KnowledgeIcon />,
  calendar: <CalendarIcon />,
  settings: <SettingsIcon />,
};

const DOCK_ACCESSIBLE_LABEL_BY_VIEW: Record<ViewKey, string> = {
  tutorial: "Dock Guide",
  inbox: "Dock Inbox",
  allmail: "Dock Mails",
  agent: "Dock Agent",
  stats: "Dock Knowledge",
  knowledgebase: "Dock Knowledge",
  calendar: "Dock Calendar",
  settings: "Dock Settings",
};

const DOCK_BASE_SIZE = 42;
const DOCK_MAGNIFIED_SIZE = 62;
const DOCK_DISTANCE = 128;

export function AppDock({ currentView, locale, onViewChange }: AppDockProps) {
  const labels = viewLabelsByLocale[locale];
  const [mouseX, setMouseX] = useState<number | null>(null);
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMouseX(event.clientX);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setMouseX(null);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-2 z-30 flex justify-center px-3 sm:bottom-3 lg:bottom-4"
      data-testid="app-dock-layer"
    >
      <nav
        className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-end gap-1.5 overflow-x-auto rounded-[1.6rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-base)] px-2 py-2 shadow-[var(--shadow-card)] backdrop-blur-2xl"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label={locale === "en" ? "Application dock" : locale === "ja" ? "アプリドック" : "应用 Dock"}
      >
        <div className="flex items-end gap-1.5" aria-label={locale === "en" ? "Main views" : locale === "ja" ? "メイン画面" : "主要窗口"}>
          {viewItems.map((item) => {
            const label = labels[item.key].label;
            const isActive = currentView === item.key;
            return (
              <DockButton
                key={item.key}
                label={label}
                accessibleLabel={DOCK_ACCESSIBLE_LABEL_BY_VIEW[item.key]}
                tooltipTestId={`dock-tooltip-${item.key}`}
                active={isActive}
                mouseX={mouseX}
                onClick={() => onViewChange(item.key)}
              >
                {DOCK_ICON_BY_VIEW[item.key]}
              </DockButton>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

type DockButtonProps = {
  label: string;
  accessibleLabel: string;
  tooltipTestId: string;
  active: boolean;
  mouseX: number | null;
  onClick: () => void;
  children: React.ReactNode;
};

function DockButton({ label, accessibleLabel, tooltipTestId, active, mouseX, onClick, children }: DockButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const distance = getDistanceFromPointer(buttonRef.current, mouseX);
  const influence = Math.max(0, 1 - Math.abs(distance) / DOCK_DISTANCE);
  const easedInfluence = influence * influence * (3 - 2 * influence);
  const size = Math.round(DOCK_BASE_SIZE + (DOCK_MAGNIFIED_SIZE - DOCK_BASE_SIZE) * easedInfluence);
  const lift = Math.round(10 * easedInfluence) + (active ? 4 : 0);

  return (
    <div className="group relative flex h-[82px] flex-col items-center justify-end pt-7" style={{ width: DOCK_MAGNIFIED_SIZE + 4 }}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-current={active ? "page" : undefined}
        aria-label={accessibleLabel}
        title={label}
        onClick={onClick}
        className={cn(
          "relative flex items-center justify-center rounded-[1.15rem] text-[color:var(--ink-muted)] transition-[background-color,color,box-shadow] duration-150 ease-out",
          "focus:outline-none",
          active
            ? "border border-[color:var(--border-info)] bg-[color:var(--surface-info)] text-[color:var(--pill-info-ink)] shadow-[0_16px_36px_rgba(36,51,82,0.14)]"
            : "border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
        )}
        animate={{
          width: size,
          height: size,
          y: -lift,
        }}
        transition={{
          type: "spring",
          stiffness: 340,
          damping: 26,
          mass: 0.28,
        }}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{children}</span>
        <span
          className={cn(
            "absolute -bottom-1.5 h-1 rounded-full transition-all",
            active ? "w-5 bg-current opacity-90" : "w-1 bg-current opacity-0 group-hover:opacity-45"
          )}
          aria-hidden="true"
        />
      </motion.button>
      <motion.span
        data-testid={tooltipTestId}
        initial={false}
        animate={{ opacity: influence > 0.14 || active ? 1 : 0, y: influence > 0.14 || active ? 0 : 4 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-black/10 bg-[rgba(20,28,44,0.92)] px-2.5 py-1 text-[11px] font-medium text-white shadow-lg dark:border-white/10 dark:bg-[rgba(242,246,252,0.94)] dark:text-[#142033]"
      >
        {label}
      </motion.span>
    </div>
  );
}

function getDistanceFromPointer(element: HTMLButtonElement | null, mouseX: number | null) {
  if (!element || mouseX === null) {
    return Number.POSITIVE_INFINITY;
  }
  const bounds = element.getBoundingClientRect();
  return mouseX - bounds.left - bounds.width / 2;
}

function InboxIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H4z" />
      <path d="M4 13h4l2 3h4l2-3h4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m21 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L3 7" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="M7 8h10a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4Z" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
      <path d="M9 18c.8.64 1.8 1 3 1s2.2-.36 3-1" />
    </svg>
  );
}

function KnowledgeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function GuideIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M12 4h9" />
      <path d="M4 9h16" />
      <path d="M4 15h8" />
      <path d="M4 4h2" />
      <path d="M4 20h2" />
    </svg>
  );
}
