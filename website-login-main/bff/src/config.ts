import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { AuthProviderMode, BffConfig, CookieConfig, FrontendConfig, UpstreamProviderConfig } from './types.js'

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

function parseMode(value: string | undefined): AuthProviderMode {
  return value?.toLowerCase() === 'upstream' ? 'upstream' : 'mock'
}

function parseSameSite(value: string | undefined): CookieConfig['sameSite'] {
  switch (value?.toLowerCase()) {
    case 'strict':
      return 'strict'
    case 'none':
      return 'none'
    default:
      return 'lax'
  }
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim()
  if (!candidate) {
    return fallback
  }

  return candidate.replace(/\/+$/, '')
}

function resolveWorkingPath(target: string): string {
  return resolve(process.cwd(), target)
}

export function loadConfig(): BffConfig {
  const nodeEnv = process.env.NODE_ENV?.trim() || 'development'
  const authProviderMode = parseMode(process.env.BFF_AUTH_PROVIDER)
  const secureCookies = process.env.BFF_COOKIE_SECURE
    ? parseBool(process.env.BFF_COOKIE_SECURE, nodeEnv === 'production')
    : nodeEnv === 'production'
  const sameSite = parseSameSite(process.env.BFF_COOKIE_SAMESITE)
  const effectiveSecure = sameSite === 'none' ? true : secureCookies
  const distDir = resolveWorkingPath(process.env.BFF_FRONTEND_DIST_DIR?.trim() || 'dist')
  const indexFile = resolve(distDir, 'index.html')
  const serveFrontend = parseBool(
    process.env.BFF_SERVE_FRONTEND,
    nodeEnv === 'production' || existsSync(distDir),
  )

  const upstream: UpstreamProviderConfig = {
    baseUrl: parseUrl(process.env.BFF_UPSTREAM_BASE_URL, ''),
    loginPath: process.env.BFF_UPSTREAM_LOGIN_PATH?.trim() || '/api/auth/login',
    registerPath: process.env.BFF_UPSTREAM_REGISTER_PATH?.trim() || '/api/auth/register',
    mePath: process.env.BFF_UPSTREAM_ME_PATH?.trim() || '/api/auth/me',
    logoutPath: process.env.BFF_UPSTREAM_LOGOUT_PATH?.trim() || '/api/auth/logout',
    timeoutMs: parseIntSafe(process.env.BFF_UPSTREAM_TIMEOUT_MS, 8000),
    authHeaderName: process.env.BFF_UPSTREAM_AUTH_HEADER_NAME?.trim() || 'Authorization',
    authHeaderPrefix: process.env.BFF_UPSTREAM_AUTH_HEADER_PREFIX?.trim() || 'Bearer',
    userPath: process.env.BFF_UPSTREAM_USER_PATH?.trim() || 'user',
    accessTokenPath: process.env.BFF_UPSTREAM_ACCESS_TOKEN_PATH?.trim() || 'accessToken',
    refreshTokenPath: process.env.BFF_UPSTREAM_REFRESH_TOKEN_PATH?.trim() || 'refreshToken',
  }

  if (authProviderMode === 'upstream' && !upstream.baseUrl) {
    throw new Error('BFF_AUTH_PROVIDER=upstream requires BFF_UPSTREAM_BASE_URL to be configured.')
  }

  const cookies: CookieConfig = {
    sessionName: process.env.BFF_SESSION_COOKIE_NAME?.trim() || 'mailpilot_session',
    refreshName: process.env.BFF_REFRESH_COOKIE_NAME?.trim() || 'mailpilot_refresh',
    domain: process.env.BFF_COOKIE_DOMAIN?.trim() || undefined,
    path: process.env.BFF_COOKIE_PATH?.trim() || '/',
    sameSite,
    secure: effectiveSecure,
    accessMaxAgeMs: parseIntSafe(process.env.BFF_SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 24 * 30),
    refreshMaxAgeMs: parseIntSafe(process.env.BFF_REFRESH_MAX_AGE_MS, 1000 * 60 * 60 * 24 * 30),
  }

  const frontend: FrontendConfig = {
    serve: serveFrontend,
    distDir,
    indexFile,
  }

  return {
    port: parseIntSafe(process.env.PORT, 3001),
    nodeEnv,
    authProviderMode,
    upstream,
    cookies,
    frontend,
  }
}

export const config = loadConfig()
