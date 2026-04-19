import React, { useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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

export function CalmBackground({ className }: { className?: string }) {
  const patternId = useId();
  const reduceMotion = useReducedMotion();
  const animatedSquares = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: index,
        x: ((index * 17) % 100) + 4,
        y: ((index * 11) % 72) + 8,
        duration: 10 + (index % 4) * 2,
      })),
    []
  );

  return (
    <div className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-[var(--app-gradient)]" />
      <motion.div
        className="absolute left-[-12%] top-[-12%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(92,154,255,0.28),transparent_68%)] blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 30, -12, 0], y: [0, 28, 48, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-18%] right-[-10%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(42,201,158,0.22),transparent_68%)] blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -32, -10, 0], y: [0, -16, 22, 0], scale: [1, 0.95, 1.06, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[24%] top-[18%] h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,rgba(253,185,93,0.16),transparent_70%)] blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -18, 6, 0], y: [0, 12, -14, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.44] dark:opacity-[0.22]">
        <defs>
          <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeOpacity="0.14" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} className="text-[var(--grid-line)]" />
      </svg>
      {!reduceMotion ? (
        <div className="absolute inset-0">
          {animatedSquares.map((square) => (
            <motion.span
              key={square.id}
              className="absolute block rounded-md border border-white/55 bg-white/35 shadow-[0_12px_32px_rgba(132,157,190,0.14)] dark:border-white/12 dark:bg-white/6"
              style={{
                left: `${square.x}%`,
                top: `${square.y}%`,
                width: square.id % 3 === 0 ? "2.5rem" : "1.75rem",
                height: square.id % 3 === 0 ? "2.5rem" : "1.75rem",
              }}
              animate={{
                opacity: [0.08, 0.24, 0.08],
                scale: [0.92, 1, 0.94],
              }}
              transition={{
                duration: square.duration,
                repeat: Infinity,
                ease: "easeInOut",
                delay: square.id * 0.32,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="absolute inset-x-0 top-0 h-36 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.55),transparent)] dark:bg-[linear-gradient(to_bottom,rgba(9,12,16,0.55),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(to_top,rgba(250,248,244,0.7),transparent)] dark:bg-[linear-gradient(to_top,rgba(8,10,14,0.85),transparent)]" />
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
        "relative overflow-hidden rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] backdrop-blur-xl",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.46),transparent_24%,transparent_76%,rgba(255,255,255,0.08))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_28%,transparent_72%,rgba(255,255,255,0.02))]" />
      {beam ? <CalmBorderBeam /> : null}
      <div className="relative">{children}</div>
    </div>
  );
});

CalmSurface.displayName = "CalmSurface";

export function CalmSpotlightCard({
  children,
  className,
  spotlightColor = "rgba(255,255,255,0.52)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  return (
    <div
      ref={ref}
      onMouseMove={(event) => {
        const bounds = ref.current?.getBoundingClientRect();
        if (!bounds) {
          return;
        }
        setPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      }}
      onMouseEnter={() => setOpacity(0.9)}
      onMouseLeave={() => setOpacity(0)}
      onFocus={() => setOpacity(0.85)}
      onBlur={() => setOpacity(0)}
      className={cn("relative overflow-hidden rounded-[var(--radius-card)]", className)}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity,
          background: `radial-gradient(420px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
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
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--focus-offset)] disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)] shadow-[0_14px_32px_rgba(21,38,74,0.16)] hover:bg-[color:var(--button-primary-hover)]",
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
      {pulse ? (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-65" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : null}
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
  delay = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const items = React.Children.toArray(children);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => (
        <motion.div
          key={(item as React.ReactElement).key ?? index}
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, delay: index * delay, ease: "easeOut" }}
        >
          {item}
        </motion.div>
      ))}
    </div>
  );
}

export function CalmBorderBeam({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
      <motion.div
        className={cn(
          "absolute left-[-18%] top-0 h-px w-36 bg-[linear-gradient(90deg,transparent,rgba(110,151,255,0.85),transparent)] blur-[0.5px]",
          className
        )}
        animate={{ x: ["0%", "130%"] }}
        transition={{ duration: 5.2, ease: "linear", repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-0 left-[-12%] h-px w-28 bg-[linear-gradient(90deg,transparent,rgba(60,191,150,0.75),transparent)] blur-[0.5px]"
        animate={{ x: ["0%", "144%"] }}
        transition={{ duration: 6.4, ease: "linear", repeat: Infinity, delay: 1.2 }}
      />
    </div>
  );
}
