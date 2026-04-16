import type { FormEvent } from "react";
import type { AuthLocale, AuthMode } from "../../types";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

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
    <div className="app-bg min-h-screen px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_24px_56px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{authCopy.brand}</p>
          <div
            className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5"
            role="tablist"
            aria-label={t("common.selectLanguage")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={authLocale === "zh"}
              onClick={() => onSelectAuthLocale("zh")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                authLocale === "zh" ? "bg-zinc-900 text-white" : "text-zinc-600"
              }`}
            >
              中文
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authLocale === "en"}
              onClick={() => onSelectAuthLocale("en")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                authLocale === "en" ? "bg-zinc-900 text-white" : "text-zinc-600"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authLocale === "ja"}
              onClick={() => onSelectAuthLocale("ja")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                authLocale === "ja" ? "bg-zinc-900 text-white" : "text-zinc-600"
              }`}
            >
              JA
            </button>
          </div>
        </div>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          {isLoginMode ? authCopy.titleLogin : authCopy.titleRegister}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {isLoginMode ? authCopy.subtitleLogin : authCopy.subtitleRegister}
        </p>

        {authSessionProbeError ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p>{authSessionProbeError}</p>
            <button
              type="button"
              onClick={onRetrySessionCheck}
              className="mt-2 inline-flex rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:border-amber-500"
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
      </div>
    </div>
  );
}
