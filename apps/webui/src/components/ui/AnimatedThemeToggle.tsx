import React, { useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "../../contexts/ThemeContext";
import { cn } from "../../lib/utils";

type ViewTransition = {
  ready?: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

type AnimatedThemeToggleProps = {
  label: string;
  className?: string;
  duration?: number;
};

export function AnimatedThemeToggle({ label, className, duration = 520 }: AnimatedThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDark = resolvedTheme === "dark";

  const handleToggle = useCallback(() => {
    const button = buttonRef.current;
    const nextTheme = isDark ? "light" : "dark";
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const transitionDocument = document as ViewTransitionDocument;

    if (!button || typeof transitionDocument.startViewTransition !== "function" || prefersReducedMotion) {
      setTheme(nextTheme);
      return;
    }

    const { top, left, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxRadius = Math.hypot(
      Math.max(x, viewportWidth - x),
      Math.max(y, viewportHeight - y)
    );

    const transition = transitionDocument.startViewTransition(() => {
      flushSync(() => setTheme(nextTheme));
    });

    if (transition.ready) {
      void transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration,
            easing: "cubic-bezier(.22,1,.36,1)",
            pseudoElement: "::view-transition-new(root)",
          } as KeyframeAnimationOptions & { pseudoElement: string }
        );
      }).catch(() => undefined);
    }
  }, [duration, isDark, setTheme]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      aria-label={label}
      aria-pressed={isDark}
      className={cn(
        "group relative inline-flex h-9 w-16 items-center rounded-lg border border-white/70 bg-white/88 p-1 text-zinc-700 shadow-sm transition hover:border-zinc-900 dark:border-white/10 dark:bg-zinc-900/82 dark:text-zinc-100",
        className
      )}
    >
      <span
        className={cn(
          "absolute inset-1 rounded-md bg-gradient-to-r transition-opacity duration-300",
          isDark
            ? "from-zinc-800 to-zinc-950 opacity-100"
            : "from-sky-100 to-amber-100 opacity-100"
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "relative z-10 flex h-7 w-7 items-center justify-center rounded-md bg-white text-zinc-900 shadow-sm transition-transform duration-300 dark:bg-zinc-100",
          isDark ? "translate-x-7" : "translate-x-0"
        )}
        aria-hidden="true"
      >
        {isDark ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36-.7-.7M6.34 6.34l-.7-.7m12.72 0-.7.7M6.34 17.66l-.7.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.35 15.35A9 9 0 0 1 8.65 3.65 9 9 0 1 0 20.35 15.35z" />
          </svg>
        )}
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
