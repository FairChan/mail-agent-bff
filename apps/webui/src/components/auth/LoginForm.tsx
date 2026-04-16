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
          className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
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
          className="h-11 w-full rounded-xl border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
        />
        {fieldErrors.password ? <p className="text-[11px] text-red-600">{fieldErrors.password}</p> : null}
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
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
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
      >
        {busy ? t("auth.working") : t("auth.submitLogin")}
      </button>

      <p className="mt-3 text-xs text-zinc-500">{t("auth.loginHint")}</p>

      <button
        type="button"
        className="text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:underline"
        onClick={onSwitchToRegister}
      >
        {t("auth.switchToRegister")}
      </button>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
