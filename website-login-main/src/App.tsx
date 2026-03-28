import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { messages } from './content/messages'
import { AuthProvider } from './context/AuthProvider'
import { GuestRoute, ProtectedRoute } from './components/auth/RouteGuards'
import { InboxPage } from './pages/InboxPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import type { Locale } from './types/auth'

const LOCALE_STORAGE_KEY = 'mailpilot-locale'

const isLocale = (value: string | null): value is Locale => value === 'zh' || value === 'en'

export default function App() {
  const location = useLocation()
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === 'undefined') {
      return 'zh'
    }

    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(saved) ? saved : 'zh'
  })

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const copy = useMemo(() => messages[locale], [locale])

  useEffect(() => {
    const pageTitle =
      location.pathname === '/register'
        ? copy.register.title
        : location.pathname === '/inbox'
          ? locale === 'zh'
            ? '收件箱'
            : 'Inbox'
          : copy.login.title

    document.title = `${copy.brand.productName} | ${pageTitle}`
  }, [copy, locale, location.pathname])

  return (
    <AuthProvider locale={locale}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage locale={locale} setLocale={setLocale} copy={copy} />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage locale={locale} setLocale={setLocale} copy={copy} />
            </GuestRoute>
          }
        />
        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <InboxPage locale={locale} setLocale={setLocale} copy={copy} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  )
}
