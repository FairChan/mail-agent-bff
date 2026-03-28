import type { Request, Response, Router } from 'express'
import { Router as createRouter } from 'express'

import { clearAuthCookies, readSessionFromCookies, writeAuthCookies } from '../auth/cookie.js'
import { validateLoginInput, validateRegisterInput } from '../auth/validation.js'
import type { AuthProvider } from '../auth/provider.js'
import type {
  AuthErrorResponse,
  AuthProviderSession,
  CookieConfig,
  LoginRequestBody,
  RegisterRequestBody,
} from '../types.js'

function statusForError(code: AuthErrorResponse['code']): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400
    case 'INVALID_CREDENTIALS':
    case 'UNAUTHORIZED':
      return 401
    case 'EMAIL_ALREADY_EXISTS':
      return 409
    case 'UPSTREAM_UNAVAILABLE':
      return 503
    default:
      return 500
  }
}

function toAuthSession(session: AuthProviderSession | undefined): AuthProviderSession {
  return {
    accessToken: session?.accessToken,
    refreshToken: session?.refreshToken,
  }
}

function respondWithFailure(response: Response, error: AuthErrorResponse): void {
  response.status(statusForError(error.code)).json(error)
}

function isRememberFlag(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function createAuthRouter(provider: AuthProvider, cookies: CookieConfig): Router {
  const router = createRouter()

  router.post('/login', async (request: Request, response: Response) => {
    const body = request.body as Partial<LoginRequestBody> | undefined
    const validationError = validateLoginInput(body ?? {})

    if (validationError) {
      respondWithFailure(response, validationError)
      return
    }

    const remember = isRememberFlag(body?.remember) ? body.remember : false
    const result = await provider.login({
      email: body?.email?.trim() ?? '',
      password: body?.password ?? '',
      remember,
    })

    if (!result.ok) {
      respondWithFailure(response, result.error)
      return
    }

    if (result.session) {
      writeAuthCookies(response, cookies, result.session, remember)
    }

    response.status(200).json({ user: result.user })
  })

  router.post('/register', async (request: Request, response: Response) => {
    const body = request.body as Partial<RegisterRequestBody> | undefined
    const validationError = validateRegisterInput(body ?? {})

    if (validationError) {
      respondWithFailure(response, validationError)
      return
    }

    const result = await provider.register({
      email: body?.email?.trim() ?? '',
      username: body?.username?.trim() ?? '',
      password: body?.password ?? '',
    })

    if (!result.ok) {
      respondWithFailure(response, result.error)
      return
    }

    if (result.session) {
      writeAuthCookies(response, cookies, result.session, true)
    }

    response.status(201).json({ user: result.user })
  })

  router.get('/me', async (request: Request, response: Response) => {
    const session = toAuthSession(readSessionFromCookies(request.cookies ?? {}, cookies))
    if (!session.accessToken && !session.refreshToken) {
      clearAuthCookies(response, cookies)
      response.status(204).send()
      return
    }

    const result = await provider.me(session)
    if (!result.ok) {
      if (result.error.code === 'UNAUTHORIZED') {
        clearAuthCookies(response, cookies)
        response.status(204).send()
        return
      }

      respondWithFailure(response, result.error)
      return
    }

    if (result.session) {
      writeAuthCookies(response, cookies, result.session, Boolean(request.cookies?.[cookies.refreshName]))
    }

    response.status(200).json({ user: result.user })
  })

  router.post('/logout', async (request: Request, response: Response) => {
    const session = toAuthSession(readSessionFromCookies(request.cookies ?? {}, cookies))

    if (session.accessToken || session.refreshToken) {
      await provider.logout(session)
    }

    clearAuthCookies(response, cookies)
    response.status(204).send()
  })

  router.use((_, response: Response) => {
    response.status(404).json({
      code: 'UNKNOWN_ERROR',
      message: 'Auth route not found.',
    } satisfies AuthErrorResponse)
  })

  return router
}
