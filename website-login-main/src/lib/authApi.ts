import type {
  AuthErrorCode,
  AuthErrorResponse,
  AuthProviderResult,
  AuthSuccessResponse,
  Locale,
  LoginRequestBody,
  RegisterRequestBody,
} from '../../shared/auth'

const AUTH_BASE_URL = '/api/auth'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isAuthSuccessResponse = (value: unknown): value is AuthSuccessResponse =>
  isRecord(value) && isRecord(value.user) && typeof value.user.id === 'string'

const isAuthErrorResponse = (value: unknown): value is AuthErrorResponse =>
  isRecord(value) && typeof value.code === 'string'

const parseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return null
  }

  const raw = await response.text()

  if (!raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const buildHeaders = (locale: Locale, hasBody: boolean): HeadersInit => ({
  Accept: 'application/json',
  'X-Locale': locale,
  ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
})

const fallbackError = (status: number): AuthErrorCode => {
  if (status === 401) {
    return 'UNAUTHORIZED'
  }

  if (status === 409) {
    return 'EMAIL_ALREADY_EXISTS'
  }

  if (status === 400 || status === 422) {
    return 'VALIDATION_ERROR'
  }

  if (status >= 500) {
    return 'UPSTREAM_UNAVAILABLE'
  }

  return 'UNKNOWN_ERROR'
}

const normalizeError = (status: number, payload: unknown): AuthErrorResponse => {
  if (isAuthErrorResponse(payload)) {
    return {
      code: payload.code as AuthErrorCode,
      message: payload.message,
      fieldErrors: payload.fieldErrors,
    }
  }

  return {
    code: fallbackError(status),
    message: isRecord(payload) && typeof payload.message === 'string' ? payload.message : undefined,
  }
}

const requestAuth = async (
  path: string,
  init: RequestInit,
  locale: Locale,
): Promise<AuthProviderResult> => {
  try {
    const response = await fetch(`${AUTH_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...buildHeaders(locale, Boolean(init.body)),
        ...(init.headers ?? {}),
      },
    })
    const payload = await parseBody(response)

    if (!response.ok) {
      return { ok: false, error: normalizeError(response.status, payload) }
    }

    if (isAuthSuccessResponse(payload)) {
      return { ok: true, user: payload.user }
    }

    return {
      ok: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Unexpected auth response.',
      },
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: undefined,
      },
    }
  }
}

export type AuthActionResult = AuthProviderResult

export const loginWithAuth = (body: LoginRequestBody, locale: Locale) =>
  requestAuth('/login', { method: 'POST', body: JSON.stringify(body) }, locale)

export const registerWithAuth = (body: RegisterRequestBody, locale: Locale) =>
  requestAuth('/register', { method: 'POST', body: JSON.stringify(body) }, locale)

export const fetchCurrentUser = async (locale: Locale): Promise<AuthProviderResult> => {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/me`, {
      method: 'GET',
      credentials: 'include',
      headers: buildHeaders(locale, false),
    })

    if (response.status === 204) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
        },
      }
    }

    const payload = await parseBody(response)

    if (!response.ok) {
      return { ok: false, error: normalizeError(response.status, payload) }
    }

    if (isAuthSuccessResponse(payload)) {
      return { ok: true, user: payload.user }
    }

    return {
      ok: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Unexpected auth response.',
      },
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: undefined,
      },
    }
  }
}

export const logoutWithAuth = async (locale: Locale): Promise<void> => {
  try {
    await fetch(`${AUTH_BASE_URL}/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(locale, false),
    })
  } catch {
    // best-effort logout; local state is cleared by the provider regardless
  }
}
