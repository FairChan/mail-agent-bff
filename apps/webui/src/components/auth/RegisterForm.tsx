import { FormEvent } from "react";
import type { AuthLocale } from "../../types";

interface RegisterFormProps {
  authLocale: AuthLocale;
  t: (key: string) => string;
  step: "form" | "verify";
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  verifyCode: string;
  pendingEmail: string;
  busy: boolean;
  error: string | null;
  fieldErrors: Partial<Record<"email" | "password" | "username", string>>;
  onEmailChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onVerifyCodeChange: (value: string) => void;
  onSubmitForm: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitVerify: (event: FormEvent<HTMLFormElement>) => void;
  onResendCode: () => void;
  onBackToForm: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({
  authLocale,
  t,
  step,
  email,
  username,
  password,
  confirmPassword,
  verifyCode,
  pendingEmail,
  busy,
  error,
  fieldErrors,
  onEmailChange,
  onUsernameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onVerifyCodeChange,
  onSubmitForm,
  onSubmitVerify,
  onResendCode,
  onBackToForm,
  onSwitchToLogin,
}: RegisterFormProps) {
  if (step === "verify") {
    return (
      <div className="mt-6 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900">{t("auth.verifyStepTitle")}</h2>
        <p className="text-sm text-zinc-600">{t("auth.verifyStepSubtitle")}</p>
        <p className="text-xs text-[color:var(--ink-subtle)]">
          {t("auth.codeSentTo")} <span className="font-medium text-[color:var(--ink-muted)]">{pendingEmail}</span>
        </p>

        <form className="space-y-3" onSubmit={onSubmitVerify} aria-busy={busy}>
          <div className="space-y-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="calm-input h-12 w-full px-3 text-center text-2xl tracking-[0.4em] font-mono"
              placeholder={t("auth.verifyCodePlaceholder")}
              aria-label={t("auth.verifyCodeLabel")}
              value={verifyCode}
              onChange={(e) => onVerifyCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] bg-[color:var(--button-primary)] px-4 text-sm font-semibold text-[color:var(--button-primary-ink)] transition hover:bg-[color:var(--button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || verifyCode.length !== 6}
          >
            {busy ? t("auth.verifying") : t("auth.submitVerify")}
          </button>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-xs text-[color:var(--ink-subtle)] hover:text-[color:var(--ink-muted)] hover:underline"
              onClick={onBackToForm}
            >
              {t("auth.backToForm")}
            </button>
            <button
              type="button"
              className="text-xs text-[color:var(--ink-subtle)] hover:text-[color:var(--ink-muted)] hover:underline"
              onClick={onResendCode}
              disabled={busy}
            >
              {t("auth.resendCode")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-3" onSubmit={onSubmitForm} aria-busy={busy}>
      <div className="space-y-1">
        <input
          type="email"
          className="calm-input h-12 w-full px-4 text-sm"
          placeholder={t("auth.email")}
          aria-label={t("auth.email")}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
        />
        {fieldErrors.email ? <p className="text-[11px] text-red-600">{fieldErrors.email}</p> : null}
      </div>

      <div className="space-y-1">
        <input
          type="text"
          className="calm-input h-12 w-full px-4 text-sm"
          placeholder={t("auth.username")}
          aria-label={t("auth.username")}
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          autoComplete="nickname"
        />
        {fieldErrors.username ? <p className="text-[11px] text-red-600">{fieldErrors.username}</p> : null}
      </div>

      <div className="space-y-1">
        <input
          type="password"
          className="calm-input h-12 w-full px-4 text-sm"
          placeholder={t("auth.password")}
          aria-label={t("auth.password")}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="new-password"
        />
        {fieldErrors.password ? <p className="text-[11px] text-red-600">{fieldErrors.password}</p> : null}
      </div>

      <div className="space-y-1">
        <input
          type="password"
          className="calm-input h-12 w-full px-4 text-sm"
          placeholder={t("auth.confirmPassword")}
          aria-label={t("auth.confirmPassword")}
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          autoComplete="new-password"
        />
        {confirmPassword && password !== confirmPassword ? (
          <p className="text-[11px] text-red-600">{t("auth.passwordMismatch")}</p>
        ) : confirmPassword && password === confirmPassword ? (
          <p className="text-[11px] text-emerald-600">{t("auth.passwordMatch")}</p>
        ) : null}
      </div>

      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] bg-[color:var(--button-primary)] px-4 text-sm font-semibold text-[color:var(--button-primary-ink)] transition hover:bg-[color:var(--button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
      >
        {busy ? t("auth.sending") : t("auth.submitRegister")}
      </button>

      <p className="mt-3 text-xs text-[color:var(--ink-subtle)]">{t("auth.registerHint")}</p>

      <button
        type="button"
        className="text-xs font-medium text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:underline"
        onClick={onSwitchToLogin}
      >
        {t("auth.switchToLogin")}
      </button>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
