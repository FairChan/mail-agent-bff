import React, { useId } from "react";
import { cn } from "../../lib/utils";

type Tone = "default" | "muted" | "info" | "success" | "warning" | "urgent";
type ButtonVariant = "primary" | "secondary" | "ghost";

const toneClasses: Record<Tone, string> = {
  default: "bg-[var(--surface-elevated)] border-[color:var(--border-strong)] text-[var(--ink)]",
  muted: "bg-[var(--surface-muted)] border-[color:var(--border-soft)] text-[var(--ink)]",
  info: "bg-[color:var(--surface-info)] border-[color:var(--border-info)] text-[var(--ink)]",
  success: "bg-[color:var(--surface-success)] border-[color:var(--border-success)] text-[var(--ink)]",
  warning: "bg-[color:var(--surface-warning)] border-[color:var(--border-warning)] text-[var(--ink)]",
  urgent: "bg-[color:var(--surface-urgent)] border-[color:var(--border-urgent)] text-[var(--ink)]",
};

const pillClasses: Record<Tone, string> = {
  default: "bg-[color:var(--pill-default)] text-[color:var(--pill-default-ink)]",
  muted: "bg-[color:var(--pill-muted)] text-[color:var(--pill-muted-ink)]",
  info: "bg-[color:var(--pill-info)] text-[color:var(--pill-info-ink)]",
  success: "bg-[color:var(--pill-success)] text-[color:var(--pill-success-ink)]",
  warning: "bg-[color:var(--pill-warning)] text-[color:var(--pill-warning-ink)]",
  urgent: "bg-[color:var(--pill-urgent)] text-[color:var(--pill-urgent-ink)]",
};

const DECORATIVE_SQUARES = Array.from({ length: 8 }, (_, index) => ({
  id: index,
  x: ((index * 19) % 100) + 3,
  y: ((index * 13) % 70) + 10,
  large: index % 3 === 0,
}));

export function CalmBackground({ className }: { className?: string }) {
  const patternId = useId();

  return (
    <div className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-[var(--app-gradient)]" />
      <div className="absolute left-[-10%] top-[-10%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(92,154,255,0.18),transparent_70%)] blur-3xl" />
      <div className="absolute bottom-[-16%] right-[-10%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(42,201,158,0.14),transparent_70%)] blur-3xl" />
      <div className="absolute right-[24%] top-[16%] h-[16rem] w-[16rem] rounded-full bg-[radial-gradient(circle,rgba(253,185,93,0.12),transparent_72%)] blur-3xl" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.28] dark:opacity-[0.16]">
        <defs>
          <pattern id={patternId} width="52" height="52" patternUnits="userSpaceOnUse">
            <path d="M52 0H0V52" fill="none" stroke="currentColor" strokeOpacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} className="text-[var(--grid-line)]" />
      </svg>
      <div className="absolute inset-0">
        {DECORATIVE_SQUARES.map((square) => (
          <span
            key={square.id}
            className="absolute block rounded-md border border-white/45 bg-white/28 shadow-[0_10px_24px_rgba(132,157,190,0.08)] dark:border-white/8 dark:bg-white/4"
            style={{
              left: `${square.x}%`,
              top: `${square.y}%`,
              width: square.large ? "2.1rem" : "1.45rem",
              height: square.large ? "2.1rem" : "1.45rem",
              opacity: square.large ? 0.24 : 0.14,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.42),transparent)] dark:bg-[linear-gradient(to_bottom,rgba(9,12,16,0.34),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(to_top,rgba(248,246,242,0.64),transparent)] dark:bg-[linear-gradient(to_top,rgba(8,10,14,0.74),transparent)]" />
    </div>
  );
}

export const CalmSurface = React.forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
    tone?: Tone;
    beam?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>
>(({ children, className, tone = "default", beam = false, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] backdrop-blur-sm",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_20%,transparent_80%,rgba(255,255,255,0.04))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_24%,transparent_82%,rgba(255,255,255,0.01))]" />
      {beam ? <CalmBorderBeam /> : null}
      <div className="relative">{children}</div>
    </div>
  );
});

CalmSurface.displayName = "CalmSurface";

export function CalmSpotlightCard({
  children,
  className,
  spotlightColor = "rgba(255,255,255,0.42)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  return (
    <div className={cn("group relative overflow-hidden rounded-[var(--radius-card)]", className)}>
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        style={{
          background: `radial-gradient(120% 120% at 50% 0%, ${spotlightColor}, transparent 66%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function CalmButton({
  children,
  className,
  variant = "secondary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--focus-offset)] disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)] shadow-[0_10px_22px_rgba(21,38,74,0.12)] hover:bg-[color:var(--button-primary-hover)]",
        variant === "secondary" &&
          "border border-[color:var(--border-strong)] bg-[color:var(--button-secondary)] text-[color:var(--button-secondary-ink)] hover:bg-[color:var(--button-secondary-hover)]",
        variant === "ghost" &&
          "border border-transparent bg-transparent text-[color:var(--ink-muted)] hover:border-[color:var(--border-soft)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CalmPill({
  children,
  className,
  tone = "default",
  pulse = false,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: Tone;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em]",
        pillClasses[tone],
        className
      )}
    >
      {pulse ? <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function CalmSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]", className)}>
      {children}
    </p>
  );
}

export function CalmAnimatedList({
  children,
  className,
  delay: _delay = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>;
}

export function CalmBorderBeam({ className }: { className?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div
        className={cn(
          "absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,151,255,0.38),transparent)]",
          className
        )}
      />
      <div className="absolute inset-x-6 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(60,191,150,0.3),transparent)]" />
    </div>
  );
}
