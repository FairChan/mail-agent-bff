"use client";

import { useCallback, useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

interface AnimatedThemeTogglerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  duration?: number;
}

export function AnimatedThemeToggler({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 直接从 resolvedTheme 计算 isDark，确保同步
  const isDark = resolvedTheme === "dark";

  const toggleTheme = useCallback(() => {
    console.log('[ThemeToggle] Button clicked, resolvedTheme:', resolvedTheme, 'isDark:', isDark);

    const button = buttonRef.current;
    if (!button) {
      console.error('[ThemeToggle] Button ref is null!');
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

    // 基于当前 resolvedTheme 计算目标主题
    const targetTheme: "light" | "dark" = isDark ? "light" : "dark";
    console.log('[ThemeToggle] Setting theme to:', targetTheme);

    const applyTheme = () => {
      console.log('[ThemeToggle] applyTheme executing');
      setTheme(targetTheme);
      console.log('[ThemeToggle] setTheme completed');
    };

    // 检查 View Transition API 支持
    if (typeof document.startViewTransition !== "function") {
      console.log('[ThemeToggle] No View Transition API, applying directly');
      applyTheme();
      return;
    }

    console.log('[ThemeToggle] Using View Transition API');
    const transition = document.startViewTransition(() => {
      flushSync(applyTheme);
    });

    const ready = transition?.ready;
    if (ready && typeof ready.then === "function") {
      ready.then(() => {
        console.log('[ThemeToggle] View transition ready, animating');
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration,
            easing: "ease-in-out",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      });
    }
  }, [resolvedTheme, isDark, setTheme, duration]);

  console.log('[ThemeToggle] Render: resolvedTheme:', resolvedTheme, 'isDark:', isDark);

  return (
    <button
      ref={buttonRef}
      onClick={toggleTheme}
      type="button"
      aria-label={isDark ? "切换到亮色模式" : "切换到暗色模式"}
      data-theme-toggle="true"
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        "h-10 w-10 transition-colors",
        "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
        "dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700",
        "z-30",
        className
      )}
      {...props}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}
