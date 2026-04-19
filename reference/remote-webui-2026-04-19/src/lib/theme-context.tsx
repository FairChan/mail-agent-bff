"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  initialized: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [initialized, setInitialized] = useState(false);

  // 解析实际主题（处理 system）- 纯计算函数
  const resolveTheme = useCallback((t: Theme): "light" | "dark" => {
    if (t === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return t;
  }, []);

  // 应用主题到 DOM
  const applyThemeToDOM = useCallback((resolved: "light" | "dark") => {
    if (resolved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // 初始化主题
  useEffect(() => {
    console.log('[ThemeProvider] Initializing');
    try {
      const stored = localStorage.getItem("theme") as Theme | null;
      if (stored && ["light", "dark", "system"].includes(stored)) {
        console.log('[ThemeProvider] Loaded from localStorage:', stored);
        setThemeState(stored);
      } else {
        console.log('[ThemeProvider] Using default: system');
        setThemeState("system");
      }
    } catch (error) {
      console.error('[ThemeProvider] localStorage error:', error);
      setThemeState("system");
    } finally {
      setInitialized(true);
    }
  }, []);

  // 初始化完成后立即应用一次
  useEffect(() => {
    if (!initialized) return;
    const initialResolved = resolveTheme(theme);
    console.log('[ThemeProvider] Initial apply - theme:', theme, '→ resolved:', initialResolved);
    applyThemeToDOM(initialResolved);
  }, [initialized, theme, resolveTheme, applyThemeToDOM]);

  // 监听 theme 变化
  useEffect(() => {
    if (!initialized) return;
    const newResolved = resolveTheme(theme);
    console.log('[ThemeProvider] Theme changed:', theme, '→ resolved:', newResolved);
    applyThemeToDOM(newResolved);
  }, [theme, initialized, resolveTheme, applyThemeToDOM]);

  // 监听系统主题变化（当使用 system 主题时）
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      console.log('[ThemeProvider] System theme changed');
      setThemeState("system");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    console.log('[ThemeProvider] setTheme called:', newTheme, 'current theme:', theme);
    setThemeState(newTheme);
    try {
      localStorage.setItem("theme", newTheme);
      console.log('[ThemeProvider] Saved to localStorage');
    } catch (error) {
      console.error('[ThemeProvider] localStorage save failed:', error);
    }
  };

  // 计算 resolvedTheme - 总是基于当前 theme 实时计算
  const resolvedTheme = resolveTheme(theme);

  console.log('[ThemeProvider] Render - theme:', theme, 'resolvedTheme:', resolvedTheme, 'initialized:', initialized);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, initialized }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
