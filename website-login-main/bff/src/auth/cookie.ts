import type { CookieOptions, Response } from 'express'

import type { AuthProviderSession, CookieConfig } from '../types.js'

function buildCookieOptions(config: CookieConfig, remember: boolean, isRefresh = false): CookieOptions {
  const maxAgeMs = isRefresh ? config.refreshMaxAgeMs : config.accessMaxAgeMs

  return {
    httpOnly: true,
    sameSite: config.sameSite,
    secure: config.secure,
    domain: config.domain,
    path: config.path,
    maxAge: remember ? maxAgeMs : undefined,
  }
}

function buildClearCookieOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.sameSite,
    secure: config.secure,
    domain: config.domain,
    path: config.path,
  }
}

export function writeAuthCookies(
  response: Response,
  config: CookieConfig,
  session: AuthProviderSession,
  remember: boolean,
): void {
  response.cookie(config.sessionName, session.accessToken, buildCookieOptions(config, remember))

  if (remember && session.refreshToken) {
    response.cookie(config.refreshName, session.refreshToken, buildCookieOptions(config, remember, true))
    return
  }

  response.clearCookie(config.refreshName, buildClearCookieOptions(config))
}

export function clearAuthCookies(response: Response, config: CookieConfig): void {
  response.clearCookie(config.sessionName, buildClearCookieOptions(config))
  response.clearCookie(config.refreshName, buildClearCookieOptions(config))
}

export function readSessionFromCookies(
  cookies: Record<string, string | undefined>,
  config: CookieConfig,
): AuthProviderSession {
  return {
    accessToken: cookies[config.sessionName],
    refreshToken: cookies[config.refreshName],
  }
}
