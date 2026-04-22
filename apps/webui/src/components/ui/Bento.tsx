import React from "react";
import { cn } from "../../lib/utils";

type BentoGridProps = {
  children: React.ReactNode;
  className?: string;
};

type BentoPanelProps = {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "urgent" | "success" | "info" | "warning" | "muted";
  as?: "div" | "section";
};

type MetricTileProps = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "default" | "urgent" | "success" | "info" | "warning" | "muted";
};

const panelToneClasses: Record<NonNullable<BentoPanelProps["tone"]>, string> = {
  default: "border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)]",
  urgent: "border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)]",
  success: "border-[color:var(--border-success)] bg-[color:var(--surface-success)]",
  info: "border-[color:var(--border-info)] bg-[color:var(--surface-info)]",
  warning: "border-[color:var(--border-warning)] bg-[color:var(--surface-warning)]",
  muted: "border-[color:var(--border-soft)] bg-[color:var(--surface-muted)]",
};

const metricToneClasses: Record<NonNullable<MetricTileProps["tone"]>, string> = {
  default: "text-[color:var(--ink)]",
  urgent: "text-[color:var(--pill-urgent-ink)]",
  success: "text-[color:var(--pill-success-ink)]",
  info: "text-[color:var(--pill-info-ink)]",
  warning: "text-[color:var(--pill-warning-ink)]",
  muted: "text-[color:var(--ink-muted)]",
};

export function BentoGrid({ children, className }: BentoGridProps) {
  return <div className={cn("grid gap-4 lg:grid-cols-12", className)}>{children}</div>;
}

export function BentoPanel({ children, className, tone = "default", as = "div" }: BentoPanelProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-panel)] border p-4 shadow-[var(--shadow-soft)] backdrop-blur-sm",
        panelToneClasses[tone],
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.38),transparent_24%,transparent_70%,rgba(255,255,255,0.05))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%,transparent_76%,rgba(255,255,255,0.01))]" />
      <div className="relative">{children}</div>
    </Component>
  );
}

export function MetricTile({ label, value, detail, tone = "default" }: MetricTileProps) {
  return (
    <div className="rounded-[1.15rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-3 shadow-[0_10px_24px_rgba(22,33,53,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{label}</p>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight", metricToneClasses[tone])}>{value}</div>
      {detail ? <p className="mt-1 text-xs leading-5 text-[color:var(--ink-subtle)]">{detail}</p> : null}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "default",
  pulse = false,
}: {
  children: React.ReactNode;
  tone?: MetricTileProps["tone"];
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tone === "urgent" && "bg-[color:var(--pill-urgent)] text-[color:var(--pill-urgent-ink)]",
        tone === "success" && "bg-[color:var(--pill-success)] text-[color:var(--pill-success-ink)]",
        tone === "info" && "bg-[color:var(--pill-info)] text-[color:var(--pill-info-ink)]",
        tone === "warning" && "bg-[color:var(--pill-warning)] text-[color:var(--pill-warning-ink)]",
        (tone === "default" || tone === "muted") && "bg-[color:var(--pill-default)] text-[color:var(--pill-default-ink)]"
      )}
    >
      {pulse ? <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
