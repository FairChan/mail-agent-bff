/**
 * App 上下文
 * 提供全局应用状态（视图、语言等）
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import type { ViewKey, AuthLocale } from "../../../../packages/shared-types/src/index.js";

interface AppState {
  currentView: ViewKey;
  locale: AuthLocale;
  sidebarOpen: boolean;
  isMobile: boolean;
}

interface AppContextValue extends AppState {
  setCurrentView: (view: ViewKey) => void;
  setLocale: (locale: AuthLocale) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setIsMobile: (isMobile: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const LOCALE_STORAGE_KEY = "mail-agent-locale";

function getStoredLocale(): AuthLocale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as AuthLocale | null;
  return stored ?? "zh";
}

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [currentView, setCurrentView] = useState<ViewKey>("inbox");
  const [locale, setLocaleState] = useState<AuthLocale>(getStoredLocale);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const setLocale = useCallback((newLocale: AuthLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const value: AppContextValue = {
    currentView,
    locale,
    sidebarOpen,
    isMobile,
    setCurrentView,
    setLocale,
    toggleSidebar,
    setSidebarOpen,
    setIsMobile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
