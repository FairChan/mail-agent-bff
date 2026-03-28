import { Bot, Inbox, Sparkles, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Locale, LocaleMessages } from '../../types/auth'
import { LanguageToggle } from '../ui/LanguageToggle'

interface AuthShellProps {
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  copy: LocaleMessages
  pageBadge: string
  children: ReactNode
}

const highlightIcons = [Sparkles, Inbox, Zap]

export function AuthShell({
  locale,
  onLocaleChange,
  copy,
  pageBadge,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-shell__aurora auth-shell__aurora--sky" />
      <div className="auth-shell__aurora auth-shell__aurora--teal" />
      <div className="auth-shell__aurora auth-shell__aurora--sun" />

      <section className="auth-shell__panel auth-shell__panel--brand">
        <div className="brand-panel__topbar">
          <div className="brand-mark">
            <Bot size={20} strokeWidth={1.8} />
          </div>
          <div>
            <p className="brand-panel__product">{copy.brand.productName}</p>
            <p className="brand-panel__eyebrow">{copy.brand.overline}</p>
          </div>
        </div>

        <span className="glass-pill">{pageBadge}</span>

        <div className="brand-panel__copy">
          <p className="brand-panel__title">{copy.brand.title}</p>
          <p>{copy.brand.description}</p>
        </div>

        <div className="brand-preview">
          <div className="brand-preview__orbit brand-preview__orbit--one" />
          <div className="brand-preview__orbit brand-preview__orbit--two" />
          <div className="brand-preview__label">
            <Sparkles size={16} />
            <span>{copy.brand.floatingLabel}</span>
          </div>
          <div className="brand-preview__window">
            <div className="brand-preview__window-top">
              <div className="brand-preview__dots">
                <span />
                <span />
                <span />
              </div>
              <div className="brand-preview__caption">
                <strong>{copy.brand.radarTitle}</strong>
                <span>{copy.brand.radarCaption}</span>
              </div>
            </div>

            <div className="brand-preview__list">
              {copy.brand.previewItems.map((item) => (
                <article key={`${item.sender}-${item.subject}`} className="mail-chip">
                  <span className={`mail-chip__tone mail-chip__tone--${item.tone}`} aria-hidden="true" />
                  <div className="mail-chip__content">
                    <strong>{item.sender}</strong>
                    <p>{item.subject}</p>
                  </div>
                  <time>{item.timestamp}</time>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="brand-metrics">
          {copy.brand.metrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>

        <div className="brand-highlights">
          {copy.brand.highlights.map((item, index) => {
            const Icon = highlightIcons[index] ?? Sparkles

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

        <p className="brand-panel__footer">{copy.brand.footer}</p>
      </section>

      <section className="auth-shell__panel auth-shell__panel--form">
        <div className="auth-shell__toolbar">
          <div className="auth-shell__toolbar-brand">
            <div className="brand-mark brand-mark--small">
              <Bot size={16} strokeWidth={1.8} />
            </div>
            <span>{copy.brand.productName}</span>
          </div>
          <LanguageToggle
            locale={locale}
            onChange={onLocaleChange}
            label={copy.common.languageLabel}
            zhLabel={copy.common.zhLabel}
            enLabel={copy.common.enLabel}
          />
        </div>

        <div className="auth-shell__content">{children}</div>
      </section>
    </main>
  )
}
