/**
 * App 上下文
 * 提供全局应用状态（视图、语言等）
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import i18n from "i18next";
import type { ViewKey, AuthLocale } from "@mail-agent/shared-types";

interface AppState {
  currentView: ViewKey;
  locale: AuthLocale;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  isMobile: boolean;
}

interface AppContextValue extends AppState {
  setCurrentView: (view: ViewKey) => void;
  setLocale: (locale: AuthLocale) => void;
  toggleSidebar: () => void;
  toggleSidebarCollapsed: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setIsMobile: (isMobile: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const LOCALE_STORAGE_KEY = "mail-agent-locale";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "mail-agent-sidebar-collapsed";

function localeToI18nLanguage(locale: AuthLocale): string {
  if (locale === "en") return "en-US";
  if (locale === "ja") return "ja-JP";
  return "zh-CN";
}

function getStoredLocale(): AuthLocale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as AuthLocale | null;
  return stored ?? "zh";
}

function getStoredSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [currentView, setCurrentView] = useState<ViewKey>("inbox");
  const [locale, setLocaleState] = useState<AuthLocale>(getStoredLocale);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(getStoredSidebarCollapsed);
  const [isMobile, setIsMobile] = useState(false);

  const setLocale = useCallback((newLocale: AuthLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    void i18n.changeLanguage(localeToI18nLanguage(newLocale));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const value: AppContextValue = {
    currentView,
    locale,
    sidebarOpen,
    sidebarCollapsed,
    isMobile,
    setCurrentView,
    setLocale,
    toggleSidebar,
    toggleSidebarCollapsed,
    setSidebarOpen,
    setSidebarCollapsed,
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
