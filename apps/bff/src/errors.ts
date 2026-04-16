/**
 * M35: 统一错误处理层次体系
 *
 * 定义应用级异常类型，用于 BFF、Gateway、Email 各层的错误处理。
 *
 * 异常层次结构：
 * - BusinessError: 业务异常（可预期，用户可见）
 * - AuthError: 认证异常
 * - RateLimitError: 速率限制异常
 * - UpstreamError: 上游异常（来自 Gateway/Composio）
 * - SystemError: 系统异常（不可预期，内部错误）
 *
 * 同时提供类型守卫工具函数，用于处理 catch 块中的 unknown 错误。
 */

/** M35: 类型守卫 — 判断 unknown 错误是否属于异常类型 */
export function isErrorOfType<T extends Error>(
  error: unknown,
  type: new (...args: unknown[]) => T
): error is T {
  return error instanceof type;
}

/** M35: 从 unknown 错误中提取安全消息 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

// 业务异常（可预期，用户可见）
export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

// 系统异常（不可预期，内部错误）
export class SystemError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "SystemError";
  }
}

// 上游异常（来自 Composio/OpenClaw Gateway）
export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 502,
    public readonly upstreamStatusCode?: number
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

// 认证异常
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// 速率限制异常
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

// 兼容旧代码：保留 GatewayHttpError 以便逐步迁移
export class GatewayHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "GatewayHttpError";
  }
}
