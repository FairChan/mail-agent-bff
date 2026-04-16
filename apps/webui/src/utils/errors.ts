/**
 * 错误处理工具函数
 * 提供友好的错误消息映射
 */

import type { AuthLocale } from "@mail-agent/shared-types";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof HttpError) {
    const rec = asRecord(error.payload);
    return (
      readOptionalStringField(rec, "errorCode") ??
      readOptionalStringField(rec, "code") ??
      readOptionalStringField(asRecord(rec?.data), "errorCode") ??
      readOptionalStringField(asRecord(rec?.data), "code")
    );
  }
  if (error instanceof Error) {
    const message = error.message;
    const codeMatch = /\b([A-Z_]{3,})\b/.exec(message);
    if (codeMatch) {
      return codeMatch[1];
    }
  }
  return undefined;
}

function readOptionalStringField(
  rec: Record<string, unknown> | null,
  key: string
): string | null {
  if (!rec) return null;
  const value = rec[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

export function authFriendlyMessage(error: unknown, locale: AuthLocale): string {
  const code = readOptionalStringField(
    error instanceof HttpError ? asRecord(error.payload) : null,
    "code"
  );
  const zh = locale === "zh";
  if (code === "EMAIL_ALREADY_EXISTS") {
    return zh ? "该邮箱已注册，请直接登录。" : "This email is already registered.";
  }
  if (code === "INVALID_CREDENTIALS" || code === "UNAUTHORIZED") {
    return zh ? "邮箱或密码错误。" : "Invalid email or password.";
  }
  if (code === "INVALID_VERIFICATION") {
    return zh ? "验证码错误，请检查后重试。" : "Incorrect verification code. Please check and try again.";
  }
  if (code === "VERIFICATION_EXPIRED") {
    return zh ? "验证码已过期，请重新注册。" : "Verification code expired. Please register again.";
  }
  if (code === "RATE_LIMITED") {
    return zh ? "请求过于频繁，请稍后重试。" : "Too many attempts. Please try again later.";
  }
  if (code === "UPSTREAM_UNAVAILABLE" || code === "AUTH_STORE_UNAVAILABLE") {
    return zh ? "认证服务暂时不可用，请稍后重试。" : "Authentication service is temporarily unavailable.";
  }
  if (error instanceof HttpError && error.status === 429) {
    return zh ? "请求过于频繁，请稍后重试。" : "Too many attempts. Please try again later.";
  }
  return zh ? userFacingErrorMessage(error) : String(error);
}

export function isRoutingFailFastError(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 412) {
    return false;
  }
  const code = errorCode(error);
  return Boolean(code && code.startsWith("MAIL_SOURCE_"));
}

export function userFacingErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "OUTLOOK_CONNECTION_REQUIRED") {
    return "当前邮箱源尚未完成 Outlook 授权，请在\"设置\"里点击\"授权 Outlook 邮箱\"。";
  }
  if (code === "COMPOSIO_CONSUMER_KEY_INVALID") {
    return "服务器的 Composio API Key 配置无效或已过期，请更新 OpenClaw composio 配置。";
  }
  if (code === "COMPOSIO_NON_JSON_RESPONSE" || code === "COMPOSIO_TOOL_TEXT_ERROR") {
    return "Composio 服务响应异常，可能是 API Key 无效。请检查 OpenClaw Composio 配置。";
  }
  if (code === "AUTH_STORE_UNAVAILABLE") {
    return "认证服务暂时不可用，请稍后重试。";
  }
  if (code === "SESSION_CLEANUP_FAILED") {
    return "登出清理暂时失败，请稍后重试。";
  }
  if (code === "MAIL_SOURCE_ROUTING_UNVERIFIED") {
    return "数据源尚未验证，请到设置页点击 verify。";
  }
  if (code === "MAIL_SOURCE_ROUTING_NOT_READY") {
    return "数据源验证未通过，请检查 connectedAccountId 和 mailboxUserId。";
  }
  if (error instanceof HttpError && (error.status === 502 || error.status === 504)) {
    return "邮件服务暂时不可用，请稍后重试。";
  }
  if (error instanceof HttpError && error.status === 503) {
    return "网关服务当前不可用，请检查 OpenClaw 与 Composio 连接状态。";
  }
  if (code === "OUTLOOK_AUTH_INITIATION_FAILED") {
    return "Outlook 授权发起失败，请检查 Composio 配置后重试。";
  }
  if (code === "OUTLOOK_AUTH_REDIRECT_MISSING") {
    return "未能获取授权跳转地址，请稍后重试。";
  }
  if (code === "GATEWAY_TIMEOUT") {
    return "请求超时，请检查 OpenClaw Gateway 是否正常运行。";
  }
  if (code === "GATEWAY_UNAVAILABLE") {
    return "OpenClaw Gateway 不可用，请确保 Gateway 已启动。";
  }
  return error instanceof Error ? error.message : String(error);
}

export function authFieldMessage(key: string | null, locale: AuthLocale): string | null {
  if (!key) {
    return null;
  }
  const zh = locale === "zh";
  if (key === "emailRequired") {
    return zh ? "请输入邮箱。" : "Email is required.";
  }
  if (key === "invalidEmail") {
    return zh ? "请输入有效邮箱地址。" : "Please enter a valid email address.";
  }
  if (key === "passwordRequired") {
    return zh ? "请输入密码。" : "Password is required.";
  }
  if (key === "passwordLength") {
    return zh ? "密码至少 8 位。" : "Password must be at least 8 characters.";
  }
  if (key === "usernameRequired") {
    return zh ? "请输入昵称。" : "Display name is required.";
  }
  return key;
}
