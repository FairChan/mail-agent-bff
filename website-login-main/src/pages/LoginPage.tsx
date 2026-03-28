import { Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/auth/AuthShell'
import { CheckboxField } from '../components/ui/CheckboxField'
import { InputField } from '../components/ui/InputField'
import { PasswordField } from '../components/ui/PasswordField'
import { StatusBanner } from '../components/ui/StatusBanner'
import { ThirdPartyButton } from '../components/ui/ThirdPartyButton'
import { useAuth } from '../context/AuthProvider'
import { resolveAuthFeedback } from '../lib/authFeedback'
import { resolveFieldError } from '../lib/formErrors'
import type { AuthPageProps, LoginFormData, LoginFormErrors, StatusBannerState } from '../types/auth'
import { validateLogin } from '../utils/validation'

const initialState: LoginFormData = {
  email: '',
  password: '',
  remember: true,
}

const initialErrors: LoginFormErrors = {}

export function LoginPage({ locale, setLocale, copy }: AuthPageProps) {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [formData, setFormData] = useState<LoginFormData>(initialState)
  const [errors, setErrors] = useState<LoginFormErrors>(initialErrors)
  const [banner, setBanner] = useState<StatusBannerState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailError = resolveFieldError(errors.email, copy.validation)
  const passwordError = resolveFieldError(errors.password, copy.validation)

  const updateField = <K extends keyof LoginFormData>(field: K, value: LoginFormData[K]) => {
    const nextFormData = { ...formData, [field]: value }
    const nextErrors = validateLogin(nextFormData)

    setFormData(nextFormData)
    setErrors((current) => ({
      ...current,
      [field]: current[field] !== undefined ? nextErrors[field] : undefined,
    }))
    setBanner(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateLogin(formData)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setBanner(null)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await login({
        email: formData.email.trim(),
        password: formData.password,
        remember: formData.remember,
      })

      if (result.ok) {
        navigate('/inbox', { replace: true })
        return
      }

      const feedback = resolveAuthFeedback(locale, result.error, copy.validation)
      setErrors(feedback.fieldErrors)
      setBanner({ tone: 'error', message: feedback.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      locale={locale}
      onLocaleChange={setLocale}
      copy={copy}
      pageBadge={copy.login.badge}
    >
      <section className="auth-card">
        <div className="auth-card__header">
          <span className="auth-card__badge">{copy.login.badge}</span>
          <h1>{copy.login.title}</h1>
          <p>{copy.login.subtitle}</p>
        </div>

        {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <InputField
            id="login-email"
            label={copy.login.emailLabel}
            type="email"
            value={formData.email}
            placeholder={copy.login.emailPlaceholder}
            autoComplete="email"
            icon={Mail}
            error={emailError}
            onChange={(event) => updateField('email', event.target.value)}
          />

          <PasswordField
            id="login-password"
            label={copy.login.passwordLabel}
            placeholder={copy.login.passwordPlaceholder}
            value={formData.password}
            error={passwordError}
            showLabel={copy.common.showPassword}
            hideLabel={copy.common.hidePassword}
            onChange={(password) => updateField('password', password)}
          />

          <div className="auth-form__row">
            <CheckboxField
              id="remember-me"
              checked={formData.remember}
              label={copy.login.remember}
              onChange={(remember) => setFormData((current) => ({ ...current, remember }))}
            />

            <button
              type="button"
              className="text-link"
              onClick={() =>
                setBanner({
                  tone: 'info',
                  message: copy.login.forgotFeedback,
                })
              }
            >
              {copy.login.forgotPassword}
            </button>
          </div>

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? copy.common.loading : copy.login.submit}
          </button>
        </form>

        <div className="separator" aria-hidden="true">
          <span>{copy.common.orContinue}</span>
        </div>

        <ThirdPartyButton
          label={copy.common.googleAction}
          onClick={() => setBanner({ tone: 'info', message: copy.common.googleFeedback })}
        />

        <p className="auth-card__footer">
          {copy.login.switchPrompt}{' '}
          <Link to="/register" className="text-link text-link--inline">
            {copy.login.switchAction}
          </Link>
        </p>
      </section>
    </AuthShell>
  )
}
