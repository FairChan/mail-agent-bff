import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthProvider'

interface GuardProps {
  children: ReactNode
}

const LoadingState = () => {
  const { locale } = useAuth()

  const text =
    locale === 'zh'
      ? {
          title: '正在验证会话',
          subtitle: '请稍候，我们正在连接安全登录状态。',
        }
      : {
          title: 'Verifying session',
          subtitle: 'Please wait while we restore your secure sign-in state.',
        }

  return (
    <main className="auth-route-state">
      <section className="auth-route-state__card" aria-busy="true">
        <div className="brand-mark brand-mark--small auth-route-state__spinner">
          <LoaderCircle size={18} strokeWidth={2.1} aria-hidden="true" />
        </div>
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </section>
    </main>
  )
}

export function ProtectedRoute({ children }: GuardProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingState />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export function GuestRoute({ children }: GuardProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingState />
  }

  if (isAuthenticated) {
    return <Navigate to="/inbox" replace />
  }

  return <>{children}</>
}
