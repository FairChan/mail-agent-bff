import { FormEvent } from "react";
import type { AuthLocale } from "../../types";

interface LoginFormProps {
  authLocale: AuthLocale;
  t: (key: string) => string;
  email: string;
  password: string;
  remember: boolean;
  busy: boolean;
  error: string | null;
  fieldErrors: Partial<Record<"email" | "password", string>>;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({
  authLocale,
  t,
  email,
  password,
  remember,
  busy,
  error,
  fieldErrors,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  onSubmit,
  onSwitchToRegister,
}: LoginFormProps) {
  return (
    <form className="mt-6 space-y-3" onSubmit={onSubmit} aria-busy={busy}>
      <div className="space-y-1">
        <label htmlFor="login-email" className="sr-only">
          {t("auth.email")}
        </label>
        <input
          id="login-email"
          type="email"
          className="calm-input h-12 w-full px-4 text-sm"
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="username"
        />
        {fieldErrors.email ? <p className="text-[11px] text-red-600">{fieldErrors.email}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="login-password" className="sr-only">
          {t("auth.password")}
        </label>
        <input
          id="login-password"
          type="password"
          className="calm-input h-12 w-full px-4 text-sm"
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
        />
        {fieldErrors.password ? <p className="text-[11px] text-red-600">{fieldErrors.password}</p> : null}
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-[color:var(--ink-muted)]">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        {t("auth.remember")}
      </label>

      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] bg-[color:var(--button-primary)] px-4 text-sm font-semibold text-[color:var(--button-primary-ink)] transition hover:bg-[color:var(--button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
      >
        {busy ? t("auth.working") : t("auth.submitLogin")}
      </button>

      <p className="mt-3 text-xs text-[color:var(--ink-subtle)]">{t("auth.loginHint")}</p>

      <button
        type="button"
        className="text-xs font-medium text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:underline"
        onClick={onSwitchToRegister}
      >
        {t("auth.switchToRegister")}
      </button>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
