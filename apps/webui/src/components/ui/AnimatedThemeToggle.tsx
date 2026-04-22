import { useTheme } from "../../contexts/ThemeContext";
import { cn } from "../../lib/utils";

type AnimatedThemeToggleProps = {
  label: string;
  className?: string;
};

export function AnimatedThemeToggle({ label, className }: AnimatedThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      aria-pressed={isDark}
      className={cn(
        "group relative inline-flex h-9 w-16 items-center rounded-lg border border-white/70 bg-white/92 p-1 text-zinc-700 shadow-sm transition-colors duration-150 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/86 dark:text-zinc-100 dark:hover:border-white/16",
        className
      )}
    >
      <span
        className={cn(
          "absolute inset-1 rounded-md bg-gradient-to-r",
          isDark ? "from-zinc-800 to-zinc-950" : "from-sky-100 to-amber-100"
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "relative z-10 flex h-7 w-7 items-center justify-center rounded-md bg-white text-zinc-900 shadow-sm transition-transform duration-150 dark:bg-zinc-100",
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
