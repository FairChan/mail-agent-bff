"use client";

import { cn } from "../../lib/utils";

interface ShimmerButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  children: React.ReactNode;
  className?: string;
}

export function ShimmerButton({ children, className, ...props }: ShimmerButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-50 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
        className
      )}
    >
      <span className="relative z-10">{children}</span>
      <span
        className="absolute inset-0 overflow-hidden rounded-lg"
        style={{ mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", maskComposite: "exclude", WebkitMaskComposite: "xor" }}
      >
        <span
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer-slide 2s infinite",
          }}
        />
      </span>
      <style>{`
        @keyframes shimmer-slide {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </button>
  );
}

