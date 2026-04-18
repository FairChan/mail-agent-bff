/**
 * Mail Agent WebUI - 主应用入口
 *
 * 已重构：使用集中式 Context 管理状态
 * - AuthContext: 认证状态
 * - MailContext: 邮件数据
 * - ThemeContext: 主题
 * - AppContext: 应用状态
 */

import React, { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, MailProvider, ThemeProvider, AppProvider, useAuth, useMail, useApp, useTheme } from "./contexts";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AgentWorkspaceWindow } from "./components/agent/AgentWorkspaceWindow";
import { AuthScreen } from "./components/auth/AuthScreen";
import { ContextAuthScreen } from "./components/auth/ContextAuthScreen";
import { InboxView } from "./components/dashboard/InboxView";
import { CalendarView } from "./components/dashboard/CalendarView";
import { StatsView } from "./components/dashboard/StatsView";
import { TutorialView } from "./components/dashboard/TutorialView";
import { KnowledgeBaseView } from "./components/dashboard/knowledgebase/KnowledgeBaseView";
import { SettingsView } from "./components/dashboard/SettingsView";
import { MailDetailModal } from "./components/dashboard/MailDetailModal";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { UrgentMailToast } from "./components/notification";
import { LoadingSpinner } from "./components/shared/LoadingSpinner";
import type { TriageMailItem } from "@mail-agent/shared-types";
import { isAgentWindowLocation } from "./utils/agentWindow";
import { authMessages, type AuthLocale, type AuthMode } from "./types";

// ========== API 客户端 ==========

const API_BASE = (import.meta.env.VITE_BFF_BASE_URL ?? "/api").trim().replace(/\/+$/, "");

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data as T;
}

type AuthFieldErrors = Partial<Record<"email" | "password" | "username", string>>;

function toI18nLocale(locale: AuthLocale): "zh-CN" | "en-US" | "ja-JP" {
  switch (locale) {
    case "en":
      return "en-US";
    case "ja":
      return "ja-JP";
    default:
      return "zh-CN";
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function AuthScreenContainer() {
  const { t, i18n } = useTranslation();
  const { locale, setLocale } = useApp();
  const { login, register, checkSession, error } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRemember, setAuthRemember] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerStep, setRegisterStep] = useState<"form" | "verify">("form");
  const [verifyCode, setVerifyCode] = useState("");
  const [pendingRegisterEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authFieldErrors, setAuthFieldErrors] = useState<AuthFieldErrors>({});

  useEffect(() => {
    void i18n.changeLanguage(toI18nLocale(locale));
  }, [i18n, locale]);

  useEffect(() => {
    setAuthError(error);
  }, [error]);

  const clearInlineAuthState = useCallback(() => {
    setAuthError(null);
    setAuthFieldErrors({});
  }, []);

  const handleLocaleSelect = useCallback((nextLocale: AuthLocale) => {
    setLocale(nextLocale);
    void i18n.changeLanguage(toI18nLocale(nextLocale));
  }, [i18n, setLocale]);

  const handleLogin = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: AuthFieldErrors = {};
    const normalizedEmail = authEmail.trim();

    if (!isValidEmail(normalizedEmail)) {
      nextErrors.email = t("auth.invalidEmail");
    }
    if (!authPassword.trim()) {
      nextErrors.password = t("auth.invalidPassword");
    }

    if (Object.keys(nextErrors).length > 0) {
      setAuthFieldErrors(nextErrors);
      setAuthError(null);
      return;
    }

    clearInlineAuthState();
    try {
      await login(normalizedEmail, authPassword, authRemember);
    } catch (loginError) {
      setAuthError(loginError instanceof Error ? loginError.message : t("error.serverError"));
    }
  }, [authEmail, authPassword, authRemember, clearInlineAuthState, login, t]);

  const handleRegister = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: AuthFieldErrors = {};
    const normalizedEmail = authEmail.trim();
    const normalizedName = registerName.trim();

    if (!isValidEmail(normalizedEmail)) {
      nextErrors.email = t("auth.invalidEmail");
    }
    if (!normalizedName) {
      nextErrors.username = t("auth.username");
    }
    if (authPassword.length < 8) {
      nextErrors.password = t("auth.invalidPassword");
    }
    if (authPassword !== registerConfirmPassword) {
      nextErrors.password = t("auth.passwordMismatch");
    }

    if (Object.keys(nextErrors).length > 0) {
      setAuthFieldErrors(nextErrors);
      setAuthError(null);
      return;
    }

    clearInlineAuthState();
    try {
      await register(normalizedEmail, normalizedName, authPassword);
    } catch (registerError) {
      setAuthError(registerError instanceof Error ? registerError.message : t("error.serverError"));
    }
  }, [authEmail, authPassword, clearInlineAuthState, register, registerConfirmPassword, registerName, t]);

  const switchAuthMode = useCallback((nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setRegisterStep("form");
    setVerifyCode("");
    clearInlineAuthState();
  }, [clearInlineAuthState]);

  return (
    <AuthScreen
      authLocale={locale}
      authMode={authMode}
      t={t}
      authBusy={false}
      authError={authError}
      authSessionProbeError={null}
      authFieldErrors={authFieldErrors}
      authCopy={authMessages[locale]}
      authEmail={authEmail}
      authPassword={authPassword}
      authRemember={authRemember}
      registerName={registerName}
      registerConfirmPassword={registerConfirmPassword}
      registerStep={registerStep}
      verifyCode={verifyCode}
      pendingRegisterEmail={pendingRegisterEmail}
      onSelectAuthLocale={handleLocaleSelect}
      onRetrySessionCheck={() => {
        void checkSession();
      }}
      onEmailChange={(value) => {
        setAuthEmail(value);
        clearInlineAuthState();
      }}
      onPasswordChange={(value) => {
        setAuthPassword(value);
        clearInlineAuthState();
      }}
      onRememberChange={setAuthRemember}
      onRegisterNameChange={(value) => {
        setRegisterName(value);
        clearInlineAuthState();
      }}
      onRegisterConfirmPasswordChange={(value) => {
        setRegisterConfirmPassword(value);
        clearInlineAuthState();
      }}
      onVerifyCodeChange={setVerifyCode}
      onLogin={(event) => {
        void handleLogin(event);
      }}
      onRegister={(event) => {
        void handleRegister(event);
      }}
      onVerifyCode={(event) => {
        event.preventDefault();
      }}
      onResendCode={() => {
        setAuthError(t("error.serverError"));
      }}
      onSwitchToRegister={() => switchAuthMode("register")}
      onSwitchToLogin={() => switchAuthMode("login")}
      onBackToRegisterForm={() => {
        setRegisterStep("form");
        setVerifyCode("");
        clearInlineAuthState();
      }}
    />
  );
}

// ========== 主布局 ==========

function MainLayout({
  tutorialCompleted,
  onCompleteTutorial,
}: {
  tutorialCompleted: boolean;
  onCompleteTutorial: () => void;
}) {
  const { isLoading } = useAuth();
  const { currentView, sidebarOpen, setSidebarOpen, isMobile } = useApp();
  const { resolvedTheme } = useTheme();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case "tutorial":
        return <TutorialView apiBase={API_BASE} onComplete={onCompleteTutorial} completed={tutorialCompleted} />;
      case "inbox":
        return <InboxView onViewMailDetail={() => {}} />;
      case "allmail":
        return <KnowledgeBaseView initialTab="mails" />;
      case "agent":
        return <AgentWorkspaceWindow apiBase={API_BASE} embedded />;
      case "calendar":
        return <CalendarView />;
      case "stats":
        return <StatsView />;
      case "knowledgebase":
        return <KnowledgeBaseView initialTab="overview" />;
      case "settings":
        return <SettingsView />;
      default:
        return <InboxView onViewMailDetail={() => {}} />;
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${resolvedTheme === "dark" ? "dark" : ""}`}>
      {/* 桌面端侧边栏 - 固定宽度 */}
      {!isMobile && (
        <div className="w-60 flex-shrink-0">
          <Sidebar />
        </div>
      )}

      {/* 移动端侧边抽屉 */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-50 w-64">
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-900">
          <div className={currentView === "agent" ? "mx-auto w-full max-w-none" : "mx-auto max-w-7xl"}>
            <ErrorBoundary>
              {renderView()}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* 邮件详情弹窗 */}
      <MailDetailModal />
      <UrgentMailToast />
    </div>
  );
}

// ========== 邮箱连接引导 ==========

function MailConnectionGuide() {
  const { setCurrentView } = useApp();

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8">
      <div className="rounded-2xl bg-blue-50 p-8 text-center dark:bg-blue-900/20">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
          <svg className="h-8 w-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-blue-900 dark:text-blue-100">
          连接你的邮箱
        </h2>
        <p className="mb-6 text-sm text-blue-700 dark:text-blue-300">
          在设置中连接 Outlook 邮箱，开始使用智能邮件管理
        </p>
        <button
          onClick={() => setCurrentView("settings")}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          前往设置
        </button>
      </div>
    </div>
  );
}

// ========== App 内容 ==========

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { activeSourceId } = useMail();
  const { currentView, setCurrentView, setIsMobile } = useApp();
  const agentWindowMode = typeof window !== "undefined" && isAgentWindowLocation(window.location);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);
  const [tutorialHydrated, setTutorialHydrated] = useState(false);
  const tutorialAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!user?.id) {
      setTutorialCompleted(false);
      setTutorialHydrated(false);
      tutorialAutoOpenedRef.current = false;
      return;
    }
    setTutorialCompleted(window.localStorage.getItem(`mail-agent-tutorial:${user.id}`) === "done");
    setTutorialHydrated(true);
  }, [user?.id]);

  const completeTutorial = useCallback(() => {
    if (typeof window !== "undefined" && user?.id) {
      window.localStorage.setItem(`mail-agent-tutorial:${user.id}`, "done");
    }
    setTutorialCompleted(true);
    setCurrentView(activeSourceId ? "inbox" : "settings");
  }, [activeSourceId, setCurrentView, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || agentWindowMode || !tutorialHydrated || tutorialCompleted) {
      return;
    }
    if (tutorialAutoOpenedRef.current || currentView === "tutorial") {
      return;
    }
    tutorialAutoOpenedRef.current = true;
    setCurrentView("tutorial");
  }, [agentWindowMode, currentView, isAuthenticated, setCurrentView, tutorialCompleted, tutorialHydrated]);

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [setIsMobile]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ContextAuthScreen />;
  }

  if (agentWindowMode) {
    return <AgentWorkspaceWindow apiBase={API_BASE} />;
  }

  if (!activeSourceId) {
    if (currentView === "settings" || currentView === "tutorial" || currentView === "agent") {
      return <MainLayout tutorialCompleted={tutorialCompleted} onCompleteTutorial={completeTutorial} />;
    }
    return <MailConnectionGuide />;
  }

  return <MainLayout tutorialCompleted={tutorialCompleted} onCompleteTutorial={completeTutorial} />;
}

// ========== 根 App ==========

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppProvider>
          <AuthProvider apiBase={API_BASE}>
            <MailProvider apiBase={API_BASE}>
                <AppContent />
            </MailProvider>
          </AuthProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
