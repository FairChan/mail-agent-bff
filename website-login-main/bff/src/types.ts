export type Locale = 'zh' | 'en'

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

export interface LoginRequestBody {
  email: string
  password: string
  remember: boolean
}

export interface RegisterRequestBody {
  email: string
  username: string
  password: string
}

export type AuthField = 'email' | 'password' | 'username'

export type FieldErrors = Partial<Record<AuthField, string>>

export type AuthErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_ALREADY_EXISTS'
  | 'UNAUTHORIZED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UNKNOWN_ERROR'

export interface AuthSuccessResponse {
  user: AuthUser
}

export interface AuthErrorResponse {
  code: AuthErrorCode
  message?: string
  fieldErrors?: FieldErrors
}

export interface AuthProviderSession {
  accessToken?: string
  refreshToken?: string
}

export interface AuthProviderSuccess {
  ok: true
  user: AuthUser
  session?: AuthProviderSession
}

export interface AuthProviderFailure {
  ok: false
  error: AuthErrorResponse
}

export type AuthProviderResult = AuthProviderSuccess | AuthProviderFailure

export type AuthProviderMode = 'mock' | 'upstream'

export interface UpstreamProviderConfig {
  baseUrl: string
  loginPath: string
  registerPath: string
  mePath: string
  logoutPath: string
  timeoutMs: number
  authHeaderName: string
  authHeaderPrefix: string
  userPath: string
  accessTokenPath: string
  refreshTokenPath: string
}

export interface CookieConfig {
  sessionName: string
  refreshName: string
  domain?: string
  path: string
  sameSite: 'lax' | 'strict' | 'none'
  secure: boolean
  accessMaxAgeMs: number
  refreshMaxAgeMs: number
}

export interface FrontendConfig {
  serve: boolean
  distDir: string
  indexFile: string
}

export interface BffConfig {
  port: number
  nodeEnv: string
  authProviderMode: AuthProviderMode
  upstream: UpstreamProviderConfig
  cookies: CookieConfig
  frontend: FrontendConfig
}
