import { LockKeyhole, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AuthShell } from '../components/auth/AuthShell'
import { useAuth } from '../context/AuthProvider'
import type { AuthPageProps } from '../types/auth'

const inboxCopy = {
  zh: {
    badge: '受保护收件箱',
    title: (name: string) => `欢迎回来，${name}`,
    subtitle: '你的登录态已由 BFF 和 HttpOnly Cookie 接管。这里是登录成功后的最小可验证页面。',
    session: '当前会话已连接，刷新页面也会继续保留。',
    logout: '退出登录',
    loggingOut: '正在退出...',
    cards: [
      {
        title: '会话安全',
        description: '前端不保存 token，登录状态由服务器 Cookie 维护。',
        icon: ShieldCheck,
      },
      {
        title: '刷新保留',
        description: '重新加载页面后，/api/auth/me 会恢复用户态。',
        icon: LockKeyhole,
      },
      {
        title: '轻量入口',
        description: '保留 MailPilot 的浅色未来感界面，并接入真实认证流程。',
        icon: Sparkles,
      },
    ],
  },
  en: {
    badge: 'Protected inbox',
    title: (name: string) => `Welcome back, ${name}`,
    subtitle:
      'Your session is now maintained by the BFF through HttpOnly cookies. This is the minimal post-login landing page.',
    session: 'Your session is active and will survive a refresh.',
    logout: 'Log out',
    loggingOut: 'Signing out...',
    cards: [
      {
        title: 'Secure session',
        description: 'The frontend never stores tokens; cookies keep the session alive.',
        icon: ShieldCheck,
      },
      {
        title: 'Refresh safe',
        description: 'Reloading the page restores user state through /api/auth/me.',
        icon: LockKeyhole,
      },
      {
        title: 'Lightweight entry',
        description: 'Keep MailPilot’s airy look while wiring in the real auth flow.',
        icon: Sparkles,
      },
    ],
  },
} as const

export function InboxPage({ locale, setLocale, copy }: AuthPageProps) {
  const { user, logout } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const text = inboxCopy[locale]

  const handleLogout = async () => {
    setIsSigningOut(true)
    try {
      await logout()
    } finally {
      setIsSigningOut(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <AuthShell
      locale={locale}
      onLocaleChange={setLocale}
      copy={copy}
      pageBadge={text.badge}
    >
      <section className="auth-card inbox-card">
        <div className="auth-card__header">
          <span className="auth-card__badge">{text.badge}</span>
          <h1>{text.title(user.displayName)}</h1>
          <p>{text.subtitle}</p>
        </div>

        <div className="inbox-card__session">
          <div className="inbox-card__avatar">
            <ShieldCheck size={22} strokeWidth={1.9} aria-hidden="true" />
          </div>
          <div>
            <strong>{user.email}</strong>
            <p>{text.session}</p>
          </div>
        </div>

        <div className="brand-highlights inbox-highlights">
          {text.cards.map((item) => {
            const Icon = item.icon

            return (
              <article key={item.title} className="highlight-card">
                <div className="highlight-card__icon">
                  <Icon size={18} strokeWidth={1.85} />
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </article>
            )
          })}
        </div>

        <button
          type="button"
          className="primary-button inbox-card__logout"
          onClick={handleLogout}
          disabled={isSigningOut}
        >
          <LogOut size={18} aria-hidden="true" />
          <span>{isSigningOut ? text.loggingOut : text.logout}</span>
        </button>
      </section>
    </AuthShell>
  )
}
