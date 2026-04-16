import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { AuthScreen } from "./AuthScreen";
import { useAuth } from "../../contexts/AuthContext";
import { useApp } from "../../contexts/AppContext";
import type { AuthLocale, AuthMode } from "../../types";

type AuthFieldErrors = Partial<Record<"email" | "password" | "username", string>>;

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ContextAuthScreen() {
  const { login, register, checkSession, isLoading, error } = useAuth();
  const { locale, setLocale } = useApp();

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRemember, setAuthRemember] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authFieldErrors, setAuthFieldErrors] = useState<AuthFieldErrors>({});

  const authCopy = useMemo(
    () =>
      locale === "zh"
        ? {
            brand: "Mery",
            titleLogin: "登录 Mery",
            titleRegister: "创建你的账号",
            subtitleLogin: "登录后进入邮件工作台。",
            subtitleRegister: "创建账号后会自动登录。",
          }
        : locale === "ja"
          ? {
              brand: "Mery",
              titleLogin: "Mery にログイン",
              titleRegister: "アカウント作成",
              subtitleLogin: "ログインしてメールワークスペースに入ります。",
              subtitleRegister: "登録後に自動でログインします。",
            }
          : {
              brand: "Mery",
              titleLogin: "Sign In to Mery",
              titleRegister: "Create Your Account",
              subtitleLogin: "Sign in to access your mail workspace.",
              subtitleRegister: "You will be signed in automatically after registration.",
            },
    [locale]
  );

  const t = useCallback(
    (key: string) => {
      const zh: Record<string, string> = {
        "common.selectLanguage": "选择语言",
        "common.retrySessionCheck": "重试会话检查",
        "auth.email": "邮箱",
        "auth.password": "密码",
        "auth.remember": "记住我（30 天）",
        "auth.working": "处理中...",
        "auth.submitLogin": "登录",
        "auth.loginHint": "如果你是首次使用，请先注册账号。",
        "auth.switchToRegister": "没有账号？去注册",
        "auth.username": "昵称",
        "auth.confirmPassword": "确认密码",
        "auth.passwordMismatch": "两次输入的密码不一致",
        "auth.passwordMatch": "密码一致",
        "auth.sending": "创建中...",
        "auth.submitRegister": "注册并进入",
        "auth.registerHint": "建议使用常用邮箱，便于后续找回和多端同步。",
        "auth.switchToLogin": "已有账号？去登录",
        "auth.verifyStepTitle": "输入邮箱验证码",
        "auth.verifyStepSubtitle": "我们已向你的邮箱发送了一封验证邮件。",
        "auth.verifyCodeLabel": "验证码",
        "auth.verifyCodePlaceholder": "6位数字",
        "auth.submitVerify": "验证并登录",
        "auth.resendCode": "没收到？重新发送",
        "auth.codeSentTo": "已发送至：",
        "auth.backToForm": "修改信息",
        "auth.verifying": "验证中...",
      };
      const en: Record<string, string> = {
        "common.selectLanguage": "Select language",
        "common.retrySessionCheck": "Retry session check",
        "auth.email": "Email",
        "auth.password": "Password",
        "auth.remember": "Remember me (30 days)",
        "auth.working": "Working...",
        "auth.submitLogin": "Sign In",
        "auth.loginHint": "If this is your first time, create an account first.",
        "auth.switchToRegister": "New here? Create an account",
        "auth.username": "Display Name",
        "auth.confirmPassword": "Confirm Password",
        "auth.passwordMismatch": "Passwords do not match",
        "auth.passwordMatch": "Passwords match",
        "auth.sending": "Creating...",
        "auth.submitRegister": "Create Account",
        "auth.registerHint": "Use your primary email for easier recovery and multi-device access.",
        "auth.switchToLogin": "Already have an account? Sign in",
        "auth.verifyStepTitle": "Enter Email Verification Code",
        "auth.verifyStepSubtitle": "We have sent a verification email to your inbox.",
        "auth.verifyCodeLabel": "Verification Code",
        "auth.verifyCodePlaceholder": "6 digits",
        "auth.submitVerify": "Verify & Sign In",
        "auth.resendCode": "Didn't receive it? Resend",
        "auth.codeSentTo": "Sent to:",
        "auth.backToForm": "Change info",
        "auth.verifying": "Verifying...",
      };
      const ja: Record<string, string> = {
        "common.selectLanguage": "言語を選択",
        "common.retrySessionCheck": "セッション確認を再試行",
        "auth.email": "メールアドレス",
        "auth.password": "パスワード",
        "auth.remember": "ログイン状態を保持（30日）",
        "auth.working": "処理中...",
        "auth.submitLogin": "ログイン",
        "auth.loginHint": "初回利用の場合は先にアカウントを作成してください。",
        "auth.switchToRegister": "初めての方は登録",
        "auth.username": "表示名",
        "auth.confirmPassword": "パスワード確認",
        "auth.passwordMismatch": "パスワードが一致しません",
        "auth.passwordMatch": "パスワードが一致しました",
        "auth.sending": "作成中...",
        "auth.submitRegister": "アカウント作成",
        "auth.registerHint": "主要メールを使うと復旧と複数端末同期が簡単です。",
        "auth.switchToLogin": "既存アカウントでログイン",
        "auth.verifyStepTitle": "メール確認コードを入力",
        "auth.verifyStepSubtitle": "受信箱に確認メールを送信しました。",
        "auth.verifyCodeLabel": "確認コード",
        "auth.verifyCodePlaceholder": "6桁の数字",
        "auth.submitVerify": "確認してログイン",
        "auth.resendCode": "届かない？再送信",
        "auth.codeSentTo": "送信先：",
        "auth.backToForm": "情報を修正",
        "auth.verifying": "確認中...",
      };

      const table = locale === "zh" ? zh : locale === "ja" ? ja : en;
      return table[key] ?? key;
    },
    [locale]
  );

  const clearErrors = useCallback(() => {
    setAuthError(null);
    setAuthFieldErrors({});
  }, []);

  const validateLoginForm = useCallback((): AuthFieldErrors => {
    const nextErrors: AuthFieldErrors = {};
    if (!authEmail.trim()) {
      nextErrors.email = locale === "zh" ? "请输入邮箱。" : locale === "ja" ? "メールアドレスを入力してください。" : "Email is required.";
    } else if (!validateEmail(authEmail.trim())) {
      nextErrors.email =
        locale === "zh" ? "请输入有效邮箱地址。" : locale === "ja" ? "有効なメールアドレスを入力してください。" : "Please enter a valid email address.";
    }
    if (!authPassword) {
      nextErrors.password = locale === "zh" ? "请输入密码。" : locale === "ja" ? "パスワードを入力してください。" : "Password is required.";
    }
    return nextErrors;
  }, [authEmail, authPassword, locale]);

  const validateRegisterForm = useCallback((): AuthFieldErrors => {
    const nextErrors = validateLoginForm();
    if (!registerName.trim()) {
      nextErrors.username = locale === "zh" ? "请输入昵称。" : locale === "ja" ? "表示名を入力してください。" : "Display name is required.";
    }
    if (authPassword.length < 8) {
      nextErrors.password =
        locale === "zh" ? "密码至少 8 位。" : locale === "ja" ? "パスワードは8文字以上必要です。" : "Password must be at least 8 characters.";
    }
    if (authPassword !== registerConfirmPassword) {
      nextErrors.password =
        locale === "zh" ? "两次输入的密码不一致。" : locale === "ja" ? "パスワードが一致しません。" : "Passwords do not match.";
    }
    return nextErrors;
  }, [authPassword, locale, registerConfirmPassword, registerName, validateLoginForm]);

  const onLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearErrors();
      const nextErrors = validateLoginForm();
      if (Object.keys(nextErrors).length > 0) {
        setAuthFieldErrors(nextErrors);
        return;
      }
      try {
        await login(authEmail.trim(), authPassword, authRemember);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Login failed");
      }
    },
    [authEmail, authPassword, authRemember, clearErrors, login, validateLoginForm]
  );

  const onRegister = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearErrors();
      const nextErrors = validateRegisterForm();
      if (Object.keys(nextErrors).length > 0) {
        setAuthFieldErrors(nextErrors);
        return;
      }
      try {
        await register(authEmail.trim(), registerName.trim(), authPassword);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Registration failed");
      }
    },
    [authEmail, authPassword, clearErrors, register, registerName, validateRegisterForm]
  );

  const switchMode = useCallback((nextMode: AuthMode) => {
    setAuthMode(nextMode);
    clearErrors();
  }, [clearErrors]);

  const retrySessionCheck = useCallback(() => {
    void checkSession();
  }, [checkSession]);

  const noopSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  }, []);

  return (
    <AuthScreen
      authLocale={locale as AuthLocale}
      authMode={authMode}
      t={t}
      authBusy={isLoading}
      authError={authError ?? error}
      authSessionProbeError={null}
      authFieldErrors={authFieldErrors}
      authCopy={authCopy}
      authEmail={authEmail}
      authPassword={authPassword}
      authRemember={authRemember}
      registerName={registerName}
      registerConfirmPassword={registerConfirmPassword}
      registerStep="form"
      verifyCode=""
      pendingRegisterEmail={authEmail}
      onSelectAuthLocale={setLocale}
      onRetrySessionCheck={retrySessionCheck}
      onEmailChange={setAuthEmail}
      onPasswordChange={setAuthPassword}
      onRememberChange={setAuthRemember}
      onRegisterNameChange={setRegisterName}
      onRegisterConfirmPasswordChange={setRegisterConfirmPassword}
      onVerifyCodeChange={() => {}}
      onLogin={onLogin}
      onRegister={onRegister}
      onVerifyCode={noopSubmit}
      onResendCode={() => {}}
      onSwitchToRegister={() => switchMode("register")}
      onSwitchToLogin={() => switchMode("login")}
      onBackToRegisterForm={() => {}}
    />
  );
}
