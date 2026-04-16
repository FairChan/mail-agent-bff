/**
 * 认证路由
 * 包含 /api/auth/* 所有认证相关端点
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { AiSummaryLocale } from "@mail-agent/shared-types";
import type { AuthUserRecord, AuthUserView } from "../types/auth.js";

export type AuthDeps = {
  prismaAuthStore: unknown;
  redisAuthSessionStore: unknown;
  sessions: Map<string, number>;
  sessionsByIp: Map<string, Set<string>>;
  loginAttempts: Map<string, { count: number; windowStart: number }>;
  authUsersById: Map<string, AuthUserRecord>;
  authUserIdByEmail: Map<string, string>;
  authSessionUserByToken: Map<string, string>;
  authSessionUserViewByToken: Map<string, AuthUserView>;
  sessionTtlMsByToken: Map<string, number>;
  legacyApiKeySessions: Set<string>;
  recordMetric: (operation: string, durationMs: number, success: boolean) => void;
  loginAttemptWindowMs: number;
  loginAttemptTtlMs: number;
  rememberSessionTtlMs: number;
  maxLoginAttemptEntries: number;
  maxSessionsPerIp: number;
  maxSessionEntries: number;
  sessionCookieName: string;
  dummyPasswordSalt: string;
  generateSixDigitCode: () => string;
  hashVerificationCode: (code: string, salt: string) => string;
  sendVerificationEmail: (email: string, code: string) => Promise<void>;
  safeErrorMessage: (error: unknown) => string;
};

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
});

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

const preferencesSchema = z.object({
  locale: z.enum(["zh-CN", "en-US", "ja-JP"]).optional(),
  displayName: z.string().min(1).max(64).optional(),
});

const resendSchema = z.object({
  email: z.string().email(),
});

type AuthField = "email" | "password" | "username";
type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "AUTH_STORE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INVALID_VERIFICATION"
  | "VERIFICATION_EXPIRED";

export function authError(code: AuthErrorCode, field?: AuthField, detail?: string) {
  const messages: Record<AuthErrorCode, string> = {
    VALIDATION_ERROR: "Validation error",
    INVALID_CREDENTIALS: "Invalid email or password",
    EMAIL_ALREADY_EXISTS: "An account with this email already exists",
    AUTH_STORE_UNAVAILABLE: "Authentication service is temporarily unavailable",
    UNAUTHORIZED: "Unauthorized",
    RATE_LIMITED: "Too many attempts. Please try again later",
    INVALID_VERIFICATION: "Invalid verification code",
    VERIFICATION_EXPIRED: "Verification code has expired",
  };
  return {
    code,
    message: detail ?? messages[code],
    ...(field ? { fieldErrors: { [field]: messages[code] } } : {}),
  };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function registerAuthRoutes(server: FastifyInstance, deps: AuthDeps) {
  function cookieAwareReply(reply: FastifyReply) {
    return reply as FastifyReply & {
      clearCookie: (name: string) => FastifyReply;
      setCookie: (name: string, value: string, options: Record<string, unknown>) => FastifyReply;
    };
  }

  // 解析认证 token
  async function resolveAuthToken(request: FastifyRequest): Promise<string | null> {
    const apiKey = request.headers["x-api-key"] as string | undefined;
    if (apiKey && apiKey.length >= 32) {
      if (deps.legacyApiKeySessions.has(apiKey)) {
        return apiKey;
      }
    }

    const cookieToken = deps.sessionCookieName
      ? (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies?.[deps.sessionCookieName]
      : undefined;
    if (cookieToken) {
      const userId = deps.authSessionUserByToken.get(cookieToken);
      if (userId) {
        return cookieToken;
      }
    }

    const authHeader = request.headers["authorization"] as string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (deps.authSessionUserByToken.has(token)) {
        return token;
      }
    }

    return null;
  }

  // 获取当前会话用户
  server.get("/api/auth/session", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    try {
      const token = await resolveAuthToken(request);
      if (!token) {
        return { ok: true, authenticated: false };
      }

      const userId = deps.authSessionUserByToken.get(token);
      if (!userId) {
        return { ok: true, authenticated: false };
      }

      const userView = deps.authSessionUserViewByToken.get(token);
      if (!userView) {
        return { ok: true, authenticated: false };
      }

      const ttl = deps.sessionTtlMsByToken.get(token) ?? 0;
      if (ttl > 0 && Date.now() > ttl) {
        deps.authSessionUserByToken.delete(token);
        deps.authSessionUserViewByToken.delete(token);
        deps.sessionTtlMsByToken.delete(token);
        cookieAwareReply(reply).clearCookie(deps.sessionCookieName);
        return { ok: true, authenticated: false };
      }

      return {
        ok: true,
        authenticated: true,
        user: userView,
      };
    } catch {
      deps.recordMetric("auth_session", Date.now() - start, false);
      return { ok: true, authenticated: false };
    }
  });

  // 获取当前用户信息
  server.get("/api/auth/me", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = await resolveAuthToken(request);
    if (!token) {
      reply.status(401);
      return authError("UNAUTHORIZED");
    }

    const userView = deps.authSessionUserViewByToken.get(token);
    if (!userView) {
      reply.status(401);
      return authError("UNAUTHORIZED");
    }

    deps.recordMetric("auth_me", Date.now() - start, true);
    return { user: userView };
  });

  // 更新用户偏好
  server.post("/api/auth/preferences", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = await resolveAuthToken(request);
    if (!token) {
      reply.status(401);
      return authError("UNAUTHORIZED");
    }

    const parsed = preferencesSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return authError("VALIDATION_ERROR");
    }

    const userId = deps.authSessionUserByToken.get(token);
    if (!userId) {
      reply.status(401);
      return authError("UNAUTHORIZED");
    }

    const userRecord = deps.authUsersById.get(userId);
    if (!userRecord) {
      reply.status(401);
      return authError("UNAUTHORIZED");
    }

    if (parsed.data.locale) {
      userRecord.locale = parsed.data.locale as AiSummaryLocale;
    }
    if (parsed.data.displayName) {
      userRecord.displayName = parsed.data.displayName;
    }
    userRecord.updatedAt = new Date().toISOString();

    const userView: AuthUserView = {
      id: userRecord.id,
      email: userRecord.email,
      displayName: userRecord.displayName,
      locale: userRecord.locale,
    };

    deps.authSessionUserViewByToken.set(token, userView);

    deps.recordMetric("auth_preferences", Date.now() - start, true);
    return { ok: true, user: userView };
  });

  // 注册
  server.post("/api/auth/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const ip = request.ip;
    const userAgent = request.headers["user-agent"] ?? "unknown";

    // 速率限制检查
    const existingWindow = deps.loginAttempts.get(ip);
    const now = Date.now();
    if (existingWindow) {
      if (now - existingWindow.windowStart < deps.loginAttemptWindowMs) {
        if (existingWindow.count >= 5) {
          reply.status(429);
          return authError("RATE_LIMITED");
        }
        existingWindow.count++;
      } else {
        deps.loginAttempts.set(ip, { count: 1, windowStart: now });
      }
    } else {
      if (deps.loginAttempts.size >= deps.maxLoginAttemptEntries) {
        deps.loginAttempts.delete(ip);
      }
      deps.loginAttempts.set(ip, { count: 1, windowStart: now });
    }

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return authError("VALIDATION_ERROR", "email");
    }

    const { email, displayName, password } = parsed.data;

    // 检查邮箱是否已存在
    if (deps.authUserIdByEmail.has(email.toLowerCase())) {
      reply.status(409);
      return authError("EMAIL_ALREADY_EXISTS", "email");
    }

    // 创建用户
    const userId = randomBytes(16).toString("hex");
    const passwordHash = await argon2.hash(password);
    const verifyCode = deps.generateSixDigitCode();
    const salt = randomBytes(8).toString("hex");
    const verifyHash = deps.hashVerificationCode(verifyCode, salt);

    const userRecord: AuthUserRecord = {
      id: userId,
      email: email.toLowerCase(),
      displayName,
      locale: "zh-CN",
      passwordSalt: salt,
      passwordHash,
      emailVerified: false,
      emailVerifiedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    deps.authUsersById.set(userId, userRecord);
    deps.authUserIdByEmail.set(email.toLowerCase(), userId);

    // 发送验证邮件
    try {
      await deps.sendVerificationEmail(email, verifyCode);
    } catch (err) {
      server.log.warn({ err, email }, "Failed to send verification email");
    }

    deps.recordMetric("auth_register", Date.now() - start, true);
    reply.status(202);
    return {
      pending: true,
      message: "Verification email sent. Please check your inbox.",
      expiresInSeconds: 1800,
    };
  });

  // 验证邮箱
  server.post("/api/auth/verify", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return authError("VALIDATION_ERROR");
    }

    const { email, code } = parsed.data;
    const userId = deps.authUserIdByEmail.get(email.toLowerCase());
    if (!userId) {
      reply.status(404);
      return authError("INVALID_VERIFICATION");
    }

    const userRecord = deps.authUsersById.get(userId);
    if (!userRecord) {
      reply.status(404);
      return authError("INVALID_VERIFICATION");
    }

    if (userRecord.emailVerified) {
      return {
        user: {
          id: userRecord.id,
          email: userRecord.email,
          displayName: userRecord.displayName,
          locale: userRecord.locale,
        },
      };
    }

    // 验证逻辑
    const hash = createHash("sha256").update(code + userRecord.passwordSalt).digest("hex");
    if (!timingSafeEqualStr(hash, userRecord.passwordHash.slice(0, 64))) {
      reply.status(400);
      return authError("INVALID_VERIFICATION");
    }

    userRecord.emailVerified = true;
    userRecord.emailVerifiedAt = new Date().toISOString();

    const token = randomBytes(32).toString("base64url");
    const ttl = Date.now() + deps.rememberSessionTtlMs;

    const userView: AuthUserView = {
      id: userRecord.id,
      email: userRecord.email,
      displayName: userRecord.displayName,
      locale: userRecord.locale,
    };

    deps.authSessionUserByToken.set(token, userRecord.id);
    deps.authSessionUserViewByToken.set(token, userView);
    deps.sessionTtlMsByToken.set(token, ttl);
    deps.sessions.set(token, ttl);
    deps.sessionsByIp.get(request.ip)?.add(token);

    cookieAwareReply(reply).setCookie(deps.sessionCookieName, token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      maxAge: Math.floor(deps.rememberSessionTtlMs / 1000),
    });

    deps.recordMetric("auth_verify", Date.now() - start, true);
    return { user: userView };
  });

  // 重新发送验证码
  server.post("/api/auth/resend", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resendSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return authError("VALIDATION_ERROR");
    }

    const { email } = parsed.data;
    try {
      const verifyCode = deps.generateSixDigitCode();
      const salt = randomBytes(8).toString("hex");
      const userId = deps.authUserIdByEmail.get(email.toLowerCase());
      if (userId) {
        const userRecord = deps.authUsersById.get(userId);
        if (userRecord) {
          userRecord.passwordSalt = salt;
          userRecord.passwordHash = deps.hashVerificationCode(verifyCode, salt);
        }
      }
      await deps.sendVerificationEmail(email, verifyCode);
      return { pending: true, message: "Verification code resent", expiresInSeconds: 1800 };
    } catch {
      reply.status(500);
      return { pending: false, message: "Failed to send email" };
    }
  });

  // 登录
  server.post("/api/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const ip = request.ip;

    // 速率限制
    const existingWindow = deps.loginAttempts.get(ip);
    const now = Date.now();
    if (existingWindow) {
      if (now - existingWindow.windowStart < deps.loginAttemptWindowMs) {
        if (existingWindow.count >= 5) {
          reply.status(429);
          return authError("RATE_LIMITED");
        }
        existingWindow.count++;
      } else {
        deps.loginAttempts.set(ip, { count: 1, windowStart: now });
      }
    } else {
      if (deps.loginAttempts.size >= deps.maxLoginAttemptEntries) {
        const oldestKey = deps.loginAttempts.keys().next().value;
        if (oldestKey) deps.loginAttempts.delete(oldestKey);
      }
      deps.loginAttempts.set(ip, { count: 1, windowStart: now });
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return authError("VALIDATION_ERROR", "email");
    }

    const { email, password, remember } = parsed.data;

    const userId = deps.authUserIdByEmail.get(email.toLowerCase());
    if (!userId) {
      reply.status(401);
      return authError("INVALID_CREDENTIALS", "email");
    }

    const userRecord = deps.authUsersById.get(userId);
    if (!userRecord) {
      reply.status(401);
      return authError("INVALID_CREDENTIALS", "password");
    }

    const valid = await argon2.verify(userRecord.passwordHash, password);
    if (!valid) {
      reply.status(401);
      return authError("INVALID_CREDENTIALS", "password");
    }

    const token = randomBytes(32).toString("base64url");
    const ttl = Date.now() + (remember ? deps.rememberSessionTtlMs : deps.loginAttemptTtlMs);

    const userView: AuthUserView = {
      id: userRecord.id,
      email: userRecord.email,
      displayName: userRecord.displayName,
      locale: userRecord.locale,
    };

    deps.authSessionUserByToken.set(token, userRecord.id);
    deps.authSessionUserViewByToken.set(token, userView);
    deps.sessionTtlMsByToken.set(token, ttl);
    deps.sessions.set(token, ttl);

    if (!deps.sessionsByIp.has(ip)) {
      deps.sessionsByIp.set(ip, new Set());
    }
    deps.sessionsByIp.get(ip)!.add(token);

    const cookieMaxAge = Math.floor((ttl - Date.now()) / 1000);
    cookieAwareReply(reply).setCookie(deps.sessionCookieName, token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      maxAge: cookieMaxAge,
    });

    deps.recordMetric("auth_login", Date.now() - start, true);
    return { user: userView };
  });

  // 登出
  server.post("/api/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = await resolveAuthToken(request);
    if (token) {
      const userId = deps.authSessionUserByToken.get(token);
      if (userId) {
        deps.authSessionUserByToken.delete(token);
        deps.authSessionUserViewByToken.delete(token);
        deps.sessionTtlMsByToken.delete(token);
        deps.sessions.delete(token);

        const ip = request.ip;
        deps.sessionsByIp.get(ip)?.delete(token);
      }
      cookieAwareReply(reply).clearCookie(deps.sessionCookieName);
    }

    return { ok: true };
  });
}
