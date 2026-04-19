"use client";

import { cn } from "../../lib/utils";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
  hover?: boolean;
}

export function BentoCard({ children, className, gradient, hover = true }: BentoCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 p-5 backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/80",
        hover && "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-zinc-950/50",
        className
      )}
    >
      {gradient && (
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-20 blur-3xl"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        />
      )}
      {children}
    </div>
  );
}

export function BentoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-3", className)}>
      {children}
    </div>
  );
}

export function BentoItem({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-zinc-200/60 bg-white/80 p-5 backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/80", colSpan, className)}>
      {children}
    </div>
  );
}
