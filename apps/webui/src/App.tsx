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
import { TutorialView } from "./components/dashboard/TutorialView";
import { KnowledgeBaseView } from "./components/dashboard/knowledgebase/KnowledgeBaseView";
import { SettingsView } from "./components/dashboard/SettingsView";
import { DotGridBackground } from "./components/backgrounds/DotGridBackground";
import { MailDetailModal } from "./components/dashboard/MailDetailModal";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { OmniSearchBar } from "./components/omnisearch";
import { UrgentMailToast } from "./components/notification";
import { LoadingSpinner } from "./components/shared/LoadingSpinner";
import type { TriageMailItem } from "@mail-agent/shared-types";
import { isAgentWindowLocation } from "./utils/agentWindow";
import { authMessages, type AuthLocale, type AuthMode } from "./types";

// ========== API 客户端 ==========

const API_BASE = (import.meta.env.VITE_BFF_BASE_URL ?? "/api").trim().replace(/\/+$/, "");
const MAIL_ONLY_TABS = ["mails"] as const;
const KNOWLEDGE_BASE_TABS = ["overview", "events", "persons", "documents"] as const;

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
  const { currentView, sidebarOpen, setSidebarOpen, isMobile, locale, sidebarCollapsed } = useApp();
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
        return (
          <KnowledgeBaseView
            initialTab="mails"
            visibleTabs={MAIL_ONLY_TABS}
            titleOverride={locale === "ja" ? "メール" : locale === "en" ? "Mails" : "邮件"}
          />
        );
      case "agent":
        return <AgentWorkspaceWindow apiBase={API_BASE} embedded />;
      case "calendar":
        return <CalendarView />;
      case "stats":
        return (
          <KnowledgeBaseView
            initialTab="overview"
            visibleTabs={KNOWLEDGE_BASE_TABS}
            titleOverride={locale === "ja" ? "ナレッジベース" : locale === "en" ? "Knowledge Base" : "知识库"}
          />
        );
      case "knowledgebase":
        return (
          <KnowledgeBaseView
            initialTab="overview"
            visibleTabs={KNOWLEDGE_BASE_TABS}
            titleOverride={locale === "ja" ? "ナレッジベース" : locale === "en" ? "Knowledge Base" : "知识库"}
          />
        );
      case "settings":
        return <SettingsView />;
      default:
        return <InboxView onViewMailDetail={() => {}} />;
    }
  };

  return (
    <div className={`app-bg relative flex h-screen overflow-hidden ${resolvedTheme === "dark" ? "dark" : ""}`}>
      <DotGridBackground className="opacity-70 dark:opacity-30" />

      {!isMobile && (
        <div
          className="relative z-10 flex-shrink-0 transition-all duration-300"
          style={{ width: sidebarCollapsed ? 64 : 224, minWidth: sidebarCollapsed ? 64 : 224 }}
        >
          <Sidebar />
        </div>
      )}

      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-50 w-64 max-w-[84vw]">
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <div className="px-3 pt-3 sm:px-4 sm:pt-4">
          <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        </div>
        <main className="flex-1 overflow-y-auto px-3 pb-4 pt-3 sm:px-4">
          <div className={currentView === "agent" ? "mx-auto w-full max-w-none" : "mx-auto max-w-7xl"}>
            <ErrorBoundary>
              {renderView()}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <MailDetailModal />
      <UrgentMailToast />
      {currentView !== "agent" ? <OmniSearchBar apiBase={API_BASE} /> : null}
    </div>
  );
}

// ========== 邮箱连接引导 ==========

function MailConnectionGuide() {
  const { setCurrentView } = useApp();

  return (
    <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-4 py-8">
      <div className="glass-panel relative w-full max-w-3xl overflow-hidden rounded-[32px] border-white/75 bg-white/78 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/72 sm:p-8">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/55 to-transparent" />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              Outlook Direct
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              先把邮箱接进来，我们再把邮件、事件和 Agent 全部点亮。
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              当前产品已经保留了你的知识库、四象限、日历和 Agent 能力。现在只差一步：连接 Outlook，让实时邮件流开始进入预处理和提醒链路。
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setCurrentView("settings")}
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                开始连接 Outlook
              </button>
              <button
                onClick={() => setCurrentView("tutorial")}
                className="rounded-xl border border-zinc-300 bg-white/80 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300"
              >
                查看接入教程
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/88 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-zinc-950/80">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <div className="space-y-3">
              {[
                "连接 Outlook 并拉取最新邮件",
                "自动归纳近一月邮件进入知识库",
                "识别 DDL、会议、考试并写入日历",
                "重要且紧急邮件即时弹窗提醒",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-zinc-50/90 px-4 py-3 dark:bg-zinc-900/80">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4.2 4.2L19 6.5" />
                    </svg>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
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
