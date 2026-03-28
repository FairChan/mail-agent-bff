import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AuthUser,
  Locale,
  LoginRequestBody,
  RegisterRequestBody,
} from '../../shared/auth'
import {
  fetchCurrentUser,
  loginWithAuth,
  logoutWithAuth,
  registerWithAuth,
  type AuthActionResult,
} from '../lib/authApi'

interface AuthContextValue {
  locale: Locale
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  refreshSession: () => Promise<AuthActionResult>
  login: (body: LoginRequestBody) => Promise<AuthActionResult>
  register: (body: RegisterRequestBody) => Promise<AuthActionResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  locale: Locale
  children: ReactNode
}

export function AuthProvider({ locale, children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const localeRef = useRef(locale)

  useEffect(() => {
    localeRef.current = locale
  }, [locale])

  const refreshSession = useCallback(async () => {
    setIsLoading(true)
    const result = await fetchCurrentUser(localeRef.current)

    if (result.ok) {
      setUser(result.user)
    } else {
      setUser(null)
    }

    setIsLoading(false)
    return result
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const login = useCallback(async (body: LoginRequestBody) => {
    const result = await loginWithAuth(body, localeRef.current)

    if (result.ok) {
      setUser(result.user)
    }

    return result
  }, [])

  const register = useCallback(async (body: RegisterRequestBody) => {
    const result = await registerWithAuth(body, localeRef.current)

    if (result.ok) {
      setUser(result.user)
    }

    return result
  }, [])

  const logout = useCallback(async () => {
    await logoutWithAuth(localeRef.current)
    setUser(null)
  }, [])

  const isAuthenticated = Boolean(user)

  const value = useMemo<AuthContextValue>(
    () => ({
      locale,
      user,
      isLoading,
      isAuthenticated,
      refreshSession,
      login,
      register,
      logout,
    }),
    [isAuthenticated, isLoading, login, locale, logout, refreshSession, register, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}
