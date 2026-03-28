import { randomUUID } from 'node:crypto'

import type {
  AuthErrorResponse,
  AuthProviderResult,
  AuthProviderSession,
  AuthUser,
  LoginRequestBody,
  RegisterRequestBody,
  UpstreamProviderConfig,
} from '../types.js'
import { validateLoginInput, validateRegisterInput } from './validation.js'
import type { AuthProvider } from './provider.js'

interface StoredSession {
  user: AuthUser
  upstreamAccessToken?: string
  upstreamRefreshToken?: string
}

function normalizeFieldErrorValue(field: 'email' | 'password' | 'username', value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()

  if (!normalized) {
    return undefined
  }

  if (field === 'email') {
    if (normalized === 'email is required.' || normalized === 'email is required') {
      return 'emailRequired'
    }

    if (
      normalized === 'please enter a valid email address.' ||
      normalized === 'please enter a valid email address'
    ) {
      return 'invalidEmail'
    }

    if (
      normalized === 'this email is already registered.' ||
      normalized === 'that email is already in use.' ||
      normalized === 'email already exists.'
    ) {
      return 'EMAIL_ALREADY_EXISTS'
    }
  }

  if (field === 'password') {
    if (normalized === 'password is required.' || normalized === 'password is required') {
      return 'passwordRequired'
    }

    if (
      normalized === 'password must be at least 8 characters.' ||
      normalized === 'password must be at least 8 characters'
    ) {
      return 'passwordLength'
    }
  }

  if (field === 'username') {
    if (normalized === 'username is required.' || normalized === 'username is required') {
      return 'usernameRequired'
    }
  }

  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getByPath(value: unknown, path: string): unknown {
  if (!path || path === '.') {
    return value
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (!isPlainObject(current)) {
      return undefined
    }

    return current[key]
  }, value)
}

function normalizeUserCandidate(candidate: unknown): AuthUser | null {
  if (!isPlainObject(candidate)) {
    return null
  }

  const id = candidate.id ?? candidate.userId ?? candidate._id ?? candidate.sub
  const email = candidate.email
  const displayName =
    candidate.displayName ?? candidate.username ?? candidate.name ?? candidate.fullName ?? candidate.email

  if (typeof id !== 'string' || typeof email !== 'string') {
    return null
  }

  return {
    id,
    email,
    displayName: typeof displayName === 'string' && displayName.trim().length > 0 ? displayName : email,
  }
}

function normalizeUser(raw: unknown, userPath: string): AuthUser | null {
  const nested = getByPath(raw, userPath)
  const direct = normalizeUserCandidate(nested)
  if (direct) {
    return direct
  }

  if (isPlainObject(raw)) {
    const data = isPlainObject(raw.data) ? raw.data : undefined
    const fromWrapper = raw.user ?? data?.user ?? raw.data ?? raw.result
    const nestedWrapper = normalizeUserCandidate(fromWrapper)
    if (nestedWrapper) {
      return nestedWrapper
    }
  }

  return normalizeUserCandidate(raw)
}

function extractToken(raw: unknown, path: string, aliases: string[]): string | undefined {
  const candidate = getByPath(raw, path)
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate
  }

  if (!isPlainObject(raw)) {
    return undefined
  }

  for (const alias of aliases) {
    const value = raw[alias]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return undefined
}

function buildErrorFromStatus(
  status: number,
  payload: unknown,
  fallbackCode: AuthErrorResponse['code'],
  fallbackMessage: string,
): AuthErrorResponse {
  const message =
    isPlainObject(payload) && typeof payload.message === 'string'
      ? payload.message
      : isPlainObject(payload) && typeof payload.error === 'string'
        ? payload.error
        : fallbackMessage

  const fieldErrors =
    isPlainObject(payload) && isPlainObject(payload.fieldErrors)
      ? (payload.fieldErrors as Record<string, unknown>)
      : isPlainObject(payload) && isPlainObject(payload.errors)
        ? (payload.errors as Record<string, unknown>)
        : undefined

  const normalizedFieldErrors =
    fieldErrors && Object.keys(fieldErrors).length > 0
      ? {
          email: normalizeFieldErrorValue('email', fieldErrors.email),
          password: normalizeFieldErrorValue('password', fieldErrors.password),
          username: normalizeFieldErrorValue('username', fieldErrors.username),
        }
      : undefined

  if (status === 409) {
    return {
      code: 'EMAIL_ALREADY_EXISTS',
      message,
      fieldErrors: normalizedFieldErrors,
    }
  }

  if (status === 401 || status === 403) {
    return {
      code: fallbackCode === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'INVALID_CREDENTIALS',
      message,
      fieldErrors: normalizedFieldErrors,
    }
  }

  if (status >= 400 && status < 500) {
    return {
      code: 'VALIDATION_ERROR',
      message,
      fieldErrors: normalizedFieldErrors,
    }
  }

  return {
    code: 'UPSTREAM_UNAVAILABLE',
    message,
    fieldErrors: normalizedFieldErrors,
  }
}

export class UpstreamAuthProvider implements AuthProvider {
  private readonly sessions = new Map<string, StoredSession>()

  constructor(private readonly config: UpstreamProviderConfig) {}

  async login(input: LoginRequestBody): Promise<AuthProviderResult> {
    const validationError = validateLoginInput(input)
    if (validationError) {
      return { ok: false, error: validationError }
    }

    return this.performAuthRequest('login', this.config.loginPath, input, input.remember)
  }

  async register(input: RegisterRequestBody): Promise<AuthProviderResult> {
    const validationError = validateRegisterInput(input)
    if (validationError) {
      return { ok: false, error: validationError }
    }

    return this.performAuthRequest('register', this.config.registerPath, input, true)
  }

  async me(session: AuthProviderSession): Promise<AuthProviderResult> {
    const sessionToken = session.accessToken || session.refreshToken
    if (!sessionToken) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session missing.',
        },
      }
    }

    const storedSession = this.sessions.get(sessionToken)
    if (!storedSession) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired or invalid.',
        },
      }
    }

    const upstreamAccessToken = storedSession.upstreamAccessToken
    const upstreamRefreshToken = storedSession.upstreamRefreshToken

    if (!upstreamAccessToken && !upstreamRefreshToken) {
      return {
        ok: true,
        user: storedSession.user,
      }
    }

    const response = await this.fetchJson(this.config.mePath, {
      method: 'GET',
      headers: this.buildAuthHeaders(upstreamAccessToken ?? upstreamRefreshToken),
    })

    if (!response.ok) {
      const error = buildErrorFromStatus(
        response.status,
        response.payload,
        'UNAUTHORIZED',
        'Unable to refresh the current session.',
      )

      if (error.code === 'UNAUTHORIZED') {
        this.sessions.delete(sessionToken)
      }

      return { ok: false, error }
    }

    const user = normalizeUser(response.payload, this.config.userPath) ?? storedSession.user
    this.sessions.set(sessionToken, {
      ...storedSession,
      user,
    })

    return {
      ok: true,
      user,
    }
  }

  async logout(session: AuthProviderSession): Promise<AuthProviderResult | void> {
    const sessionToken = session.accessToken || session.refreshToken
    if (!sessionToken) {
      return
    }

    const storedSession = this.sessions.get(sessionToken)
    if (!storedSession) {
      return
    }

    if (storedSession.upstreamAccessToken || storedSession.upstreamRefreshToken) {
      await this.fetchJson(this.config.logoutPath, {
        method: 'POST',
        headers: this.buildAuthHeaders(storedSession.upstreamAccessToken ?? storedSession.upstreamRefreshToken),
      })
    }

    this.sessions.delete(sessionToken)
  }

  private async performAuthRequest(
    operation: 'login' | 'register',
    path: string,
    input: LoginRequestBody | RegisterRequestBody,
    remember: boolean,
  ): Promise<AuthProviderResult> {
    const response = await this.fetchJson(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const error = buildErrorFromStatus(
        response.status,
        response.payload,
        operation === 'register' ? 'EMAIL_ALREADY_EXISTS' : 'INVALID_CREDENTIALS',
        operation === 'register'
          ? 'Registration failed.'
          : 'The email or password is incorrect.',
      )

      return { ok: false, error }
    }

    const user = normalizeUser(response.payload, this.config.userPath)
    if (!user) {
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'The upstream response did not contain a user object.',
        },
      }
    }

    const upstreamAccessToken = extractToken(
      response.payload,
      this.config.accessTokenPath,
      ['accessToken', 'access_token', 'token', 'jwt', 'sessionId', 'session_id'],
    )
    const upstreamRefreshToken = extractToken(
      response.payload,
      this.config.refreshTokenPath,
      ['refreshToken', 'refresh_token'],
    )
    const sessionToken = randomUUID()

    this.sessions.set(sessionToken, {
      user,
      upstreamAccessToken,
      upstreamRefreshToken,
    })

    return {
      ok: true,
      user,
      session: {
        accessToken: sessionToken,
        refreshToken: remember ? upstreamRefreshToken : undefined,
      },
    }
  }

  private buildAuthHeaders(token?: string): Record<string, string> {
    if (!token) {
      return {}
    }

    return {
      [this.config.authHeaderName]: `${this.config.authHeaderPrefix} ${token}`,
    }
  }

  private async fetchJson(
    path: string,
    init: RequestInit,
  ): Promise<{ ok: true; status: number; payload: unknown } | { ok: false; status: number; payload: unknown }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      })

      const text = await response.text()
      let payload: unknown = text

      if (text.length > 0) {
        try {
          payload = JSON.parse(text)
        } catch {
          payload = text
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          payload,
        }
      }

      return {
        ok: true,
        status: response.status,
        payload,
      }
    } catch (error) {
      return {
        ok: false,
        status: 503,
        payload: {
          message: error instanceof Error ? error.message : 'Upstream request failed.',
        },
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createUpstreamAuthProvider(config: UpstreamProviderConfig): AuthProvider {
  return new UpstreamAuthProvider(config)
}
