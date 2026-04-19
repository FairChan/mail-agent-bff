import type { FormEvent } from "react";
import type { AuthLocale, AuthMode } from "../../types";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { CalmBackground, CalmPill, CalmSurface } from "../ui/Calm";

interface AuthScreenProps {
  authLocale: AuthLocale;
  authMode: AuthMode;
  t: (key: string) => string;
  authBusy: boolean;
  authError: string | null;
  authSessionProbeError: string | null;
  authFieldErrors: Partial<Record<"email" | "password" | "username", string>>;
  authCopy: {
    brand: string;
    titleLogin: string;
    titleRegister: string;
    subtitleLogin: string;
    subtitleRegister: string;
  };
  authEmail: string;
  authPassword: string;
  authRemember: boolean;
  registerName: string;
  registerConfirmPassword: string;
  registerStep: "form" | "verify";
  verifyCode: string;
  pendingRegisterEmail: string;
  onSelectAuthLocale: (nextLocale: AuthLocale) => void;
  onRetrySessionCheck: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberChange: (value: boolean) => void;
  onRegisterNameChange: (value: string) => void;
  onRegisterConfirmPasswordChange: (value: string) => void;
  onVerifyCodeChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  onVerifyCode: (event: FormEvent<HTMLFormElement>) => void;
  onResendCode: () => void;
  onSwitchToRegister: () => void;
  onSwitchToLogin: () => void;
  onBackToRegisterForm: () => void;
}

export function AuthScreen({
  authLocale,
  authMode,
  t,
  authBusy,
  authError,
  authSessionProbeError,
  authFieldErrors,
  authCopy,
  authEmail,
  authPassword,
  authRemember,
  registerName,
  registerConfirmPassword,
  registerStep,
  verifyCode,
  pendingRegisterEmail,
  onSelectAuthLocale,
  onRetrySessionCheck,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  onRegisterNameChange,
  onRegisterConfirmPasswordChange,
  onVerifyCodeChange,
  onLogin,
  onRegister,
  onVerifyCode,
  onResendCode,
  onSwitchToRegister,
  onSwitchToLogin,
  onBackToRegisterForm,
}: AuthScreenProps) {
  const isLoginMode = authMode === "login";

  return (
    <div className="app-bg relative min-h-screen overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8">
      <CalmBackground />
      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]">
        <CalmSurface className="hidden min-h-[40rem] p-8 lg:flex lg:flex-col lg:justify-between" beam>
          <div>
            <CalmPill tone="info">{authCopy.brand}</CalmPill>
            <h1 className="mt-5 max-w-lg text-4xl font-semibold tracking-tight text-[color:var(--ink)]">
              Calm Bento for mailbox triage, knowledge capture, and agent workflows.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--ink-muted)]">
              先把邮箱、日历和 Agent 放进同一个工作台，再让重要邮件、DDL、会议和知识卡片自动排好队。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["实时预处理", "新邮件进入后自动归类、提取日期并推送提醒。"],
              ["知识库沉淀", "旧邮件归纳为可复用的摘要、事件和人物画像。"],
              ["语义检索", "直接用自然语言问邮箱，不必翻历史。"],
              ["Agent 协作", "把邮箱上下文交给专属工作区和工具链。"],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4">
                <p className="text-sm font-semibold text-[color:var(--ink)]">{title}</p>
                <p className="mt-2 text-xs leading-6 text-[color:var(--ink-subtle)]">{desc}</p>
              </div>
            ))}
          </div>
        </CalmSurface>

        <CalmSurface className="w-full max-w-xl justify-self-center p-6 sm:p-7" beam>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">{authCopy.brand}</p>
              <p className="mt-1 text-sm text-[color:var(--ink-muted)]">{isLoginMode ? "Welcome back" : "Create your workspace"}</p>
            </div>
            <div
              className="inline-flex rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-soft)] p-1"
              role="tablist"
              aria-label={t("common.selectLanguage")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={authLocale === "zh"}
                onClick={() => onSelectAuthLocale("zh")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  authLocale === "zh" ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]" : "text-[color:var(--ink-muted)]"
                }`}
              >
                中文
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authLocale === "en"}
                onClick={() => onSelectAuthLocale("en")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  authLocale === "en" ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]" : "text-[color:var(--ink-muted)]"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authLocale === "ja"}
                onClick={() => onSelectAuthLocale("ja")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  authLocale === "ja" ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]" : "text-[color:var(--ink-muted)]"
                }`}
              >
                JA
              </button>
            </div>
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[color:var(--ink)]">
            {isLoginMode ? authCopy.titleLogin : authCopy.titleRegister}
          </h1>
          <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">
            {isLoginMode ? authCopy.subtitleLogin : authCopy.subtitleRegister}
          </p>

          {authSessionProbeError ? (
            <div className="mt-4 rounded-[1.1rem] border border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] px-3 py-3 text-xs text-[color:var(--pill-warning-ink)]">
              <p>{authSessionProbeError}</p>
              <button
                type="button"
                onClick={onRetrySessionCheck}
                className="mt-2 inline-flex rounded-full border border-[color:var(--border-warning)] bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[color:var(--pill-warning-ink)] hover:bg-white"
              >
                {t("common.retrySessionCheck")}
              </button>
            </div>
          ) : null}

          {isLoginMode ? (
            <LoginForm
              authLocale={authLocale}
              t={t}
              email={authEmail}
              password={authPassword}
              remember={authRemember}
              busy={authBusy}
              error={authError}
              fieldErrors={authFieldErrors}
              onEmailChange={onEmailChange}
              onPasswordChange={onPasswordChange}
              onRememberChange={onRememberChange}
              onSubmit={onLogin}
              onSwitchToRegister={onSwitchToRegister}
            />
          ) : (
            <RegisterForm
              authLocale={authLocale}
              t={t}
              step={registerStep}
              email={authEmail}
              username={registerName}
              password={authPassword}
              confirmPassword={registerConfirmPassword}
              verifyCode={verifyCode}
              pendingEmail={pendingRegisterEmail}
              busy={authBusy}
              error={authError}
              fieldErrors={authFieldErrors}
              onEmailChange={onEmailChange}
              onUsernameChange={onRegisterNameChange}
              onPasswordChange={onPasswordChange}
              onConfirmPasswordChange={onRegisterConfirmPasswordChange}
              onVerifyCodeChange={onVerifyCodeChange}
              onSubmitForm={onRegister}
              onSubmitVerify={onVerifyCode}
              onResendCode={onResendCode}
              onBackToForm={onBackToRegisterForm}
              onSwitchToLogin={onSwitchToLogin}
            />
          )}
        </CalmSurface>
      </div>
    </div>
  );
}
