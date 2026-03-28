import type { AuthProviderResult, LoginRequestBody, RegisterRequestBody } from '../types.js'

export interface AuthProvider {
  login(input: LoginRequestBody): Promise<AuthProviderResult>
  register(input: RegisterRequestBody): Promise<AuthProviderResult>
  me(session: { accessToken?: string; refreshToken?: string }): Promise<AuthProviderResult>
  logout(session: { accessToken?: string; refreshToken?: string }): Promise<AuthProviderResult | void>
}
