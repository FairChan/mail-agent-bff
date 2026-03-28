import type { Locale } from '../../types/auth'

interface LanguageToggleProps {
  locale: Locale
  onChange: (locale: Locale) => void
  label: string
  zhLabel: string
  enLabel: string
}

export function LanguageToggle({
  locale,
  onChange,
  label,
  zhLabel,
  enLabel,
}: LanguageToggleProps) {
  return (
    <div className="language-toggle" aria-label={label}>
      <button
        type="button"
        className={locale === 'zh' ? 'language-toggle__button is-active' : 'language-toggle__button'}
        onClick={() => onChange('zh')}
        aria-pressed={locale === 'zh'}
      >
        {zhLabel}
      </button>
      <button
        type="button"
        className={locale === 'en' ? 'language-toggle__button is-active' : 'language-toggle__button'}
        onClick={() => onChange('en')}
        aria-pressed={locale === 'en'}
      >
        {enLabel}
      </button>
    </div>
  )
}
