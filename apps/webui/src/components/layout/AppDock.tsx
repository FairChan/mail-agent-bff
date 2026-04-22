import {
  AnimatePresence,
  motion,
  type MotionValue,
  type SpringOptions,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import React, { Children, cloneElement, useMemo, useRef, useState } from "react";
import { viewItems, viewLabelsByLocale, type AuthLocale, type ViewKey } from "@mail-agent/shared-types";
import { cn } from "../../lib/utils";

type AppDockProps = {
  currentView: ViewKey;
  locale: AuthLocale;
  onViewChange: (view: ViewKey) => void;
};

const REACTBITS_DOCK_SPRING: SpringOptions = { mass: 0.1, stiffness: 150, damping: 12 };

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

export function AppDock({ currentView, locale, onViewChange }: AppDockProps) {
  const labels = viewLabelsByLocale[locale];
  const ariaLabel = locale === "en" ? "Application dock" : locale === "ja" ? "アプリドック" : "应用 Dock";
  const toolbarLabel = locale === "en" ? "Main views" : locale === "ja" ? "メイン画面" : "主要窗口";
  const items = viewItems.map((item) => ({
    key: item.key,
    icon: DOCK_ICON_BY_VIEW[item.key],
    label: labels[item.key].label,
    accessibleLabel: DOCK_ACCESSIBLE_LABEL_BY_VIEW[item.key],
    tooltipTestId: `dock-tooltip-${item.key}`,
    active: currentView === item.key || (currentView === "knowledgebase" && item.key === "stats"),
    onClick: () => onViewChange(item.key),
  }));

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-2 z-30 flex justify-center px-3 sm:bottom-3 lg:bottom-4"
      data-testid="app-dock-layer"
    >
      <Dock items={items} ariaLabel={ariaLabel} toolbarLabel={toolbarLabel} />
    </div>
  );
}

type DockItemData = {
  key: ViewKey;
  icon: React.ReactNode;
  label: string;
  accessibleLabel: string;
  tooltipTestId: string;
  active: boolean;
  onClick: () => void;
  className?: string;
};

type DockProps = {
  items: DockItemData[];
  ariaLabel: string;
  toolbarLabel: string;
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
};

type DockItemProps = {
  className?: string;
  label: string;
  accessibleLabel: string;
  tooltipTestId: string;
  active: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onTooltipChange: (tooltip: DockTooltipData | null) => void;
};

type DockTooltipData = {
  id: string;
  testId: string;
  label: string;
  left: number;
};

function DockItem({
  children,
  className = "",
  label,
  accessibleLabel,
  tooltipTestId,
  active,
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
  containerRef,
  onTooltipChange,
}: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const isHovered = useMotionValue(0);
  const tooltipId = `${tooltipTestId}-label`;

  const showTooltip = () => {
    const buttonRect = ref.current?.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!buttonRect || !containerRect) {
      return;
    }

    onTooltipChange({
      id: tooltipId,
      testId: tooltipTestId,
      label,
      left: buttonRect.left - containerRect.left + buttonRect.width / 2,
    });
  };

  const mouseDistance = useTransform(mouseX, (value) => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize,
    };
    return value - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  return (
    <motion.button
      ref={ref}
      type="button"
      style={{ width: size, height: size }}
      onHoverStart={() => {
        isHovered.set(1);
        showTooltip();
      }}
      onHoverEnd={() => {
        isHovered.set(0);
        onTooltipChange(null);
      }}
      onFocus={() => {
        isHovered.set(1);
        showTooltip();
      }}
      onBlur={() => {
        isHovered.set(0);
        onTooltipChange(null);
      }}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-describedby={tooltipId}
      aria-label={accessibleLabel}
      title={label}
      className={cn(
        "relative z-0 inline-flex shrink-0 items-center justify-center rounded-full border-2 shadow-md outline-none transition-[background-color,border-color,color,box-shadow] duration-150 hover:z-10 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[color:var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-base)]",
        active
          ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)] text-[color:var(--pill-info-ink)] shadow-[0_14px_28px_rgba(36,51,82,0.16)]"
          : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]",
        className
      )}
    >
      {Children.map(children, (child) =>
        React.isValidElement<{ isHovered?: MotionValue<number> }>(child) ? cloneElement(child, { isHovered }) : child
      )}
      <span
        className={cn(
          "absolute -bottom-2 h-1 rounded-full bg-current transition-[opacity,width] duration-150",
          active ? "w-5 opacity-90" : "w-1 opacity-0"
        )}
        aria-hidden="true"
      />
    </motion.button>
  );
}

type DockLabelProps = {
  tooltip: DockTooltipData | null;
};

function DockLabel({ tooltip }: DockLabelProps) {
  return (
    <AnimatePresence>
      {tooltip && (
        <motion.span
          id={tooltip.id}
          role="tooltip"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          data-testid={tooltip.testId}
          className="pointer-events-none absolute top-2 z-30 w-fit whitespace-nowrap rounded-md border border-black/10 bg-[rgba(20,28,44,0.92)] px-2 py-0.5 text-xs font-medium text-white shadow-lg dark:border-white/10 dark:bg-[rgba(242,246,252,0.94)] dark:text-[#142033]"
          style={{ left: tooltip.left, x: "-50%" }}
        >
          {tooltip.label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockIcon({ children, className = "" }: DockIconProps) {
  return <span className={cn("flex h-5 w-5 items-center justify-center", className)}>{children}</span>;
}

function Dock({
  items,
  ariaLabel,
  toolbarLabel,
  className = "",
  spring = REACTBITS_DOCK_SPRING,
  magnification = 64,
  distance = 180,
  panelHeight = 68,
  dockHeight = 118,
  baseItemSize = 46,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<DockTooltipData | null>(null);

  const maxHeight = useMemo(() => Math.max(dockHeight, magnification + magnification / 2 + 4), [dockHeight, magnification]);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.nav
      style={{ height, minHeight: maxHeight, scrollbarWidth: "none" }}
      className="pointer-events-none relative w-full max-w-[calc(100vw-1.5rem)] overflow-visible"
      aria-label={ariaLabel}
    >
      <motion.div
        onMouseMove={({ pageX }) => {
          isHovered.set(1);
          mouseX.set(pageX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
          setActiveTooltip(null);
        }}
        className={cn(
          "pointer-events-auto absolute bottom-0 left-1/2 w-fit max-w-full -translate-x-1/2 transform overflow-visible rounded-[1.55rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-base)] shadow-[var(--shadow-card)] backdrop-blur-sm",
          className
        )}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label={toolbarLabel}
        ref={panelRef}
      >
        <DockLabel tooltip={activeTooltip} />
        <div className="flex h-full max-w-full items-end gap-3 px-3 pb-2">
          {items.map((item) => (
            <DockItem
              key={item.key}
              onClick={item.onClick}
              className={item.className}
              label={item.label}
              accessibleLabel={item.accessibleLabel}
              tooltipTestId={item.tooltipTestId}
              active={item.active}
              mouseX={mouseX}
              spring={spring}
              distance={distance}
              magnification={magnification}
              baseItemSize={baseItemSize}
              containerRef={panelRef}
              onTooltipChange={setActiveTooltip}
            >
              <DockIcon>{item.icon}</DockIcon>
            </DockItem>
          ))}
        </div>
      </motion.div>
    </motion.nav>
  );
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
