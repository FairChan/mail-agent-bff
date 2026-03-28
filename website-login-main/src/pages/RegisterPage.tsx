import { Mail, UserRound } from 'lucide-react'
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
import type {
  AuthPageProps,
  RegisterFormData,
  RegisterFormErrors,
  StatusBannerState,
} from '../types/auth'
import { validateRegister } from '../utils/validation'

const initialState: RegisterFormData = {
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
}

const initialErrors: RegisterFormErrors = {}

export function RegisterPage({ locale, setLocale, copy }: AuthPageProps) {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [formData, setFormData] = useState<RegisterFormData>(initialState)
  const [errors, setErrors] = useState<RegisterFormErrors>(initialErrors)
  const [banner, setBanner] = useState<StatusBannerState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailError = resolveFieldError(errors.email, copy.validation)
  const usernameError = resolveFieldError(errors.username, copy.validation)
  const passwordError = resolveFieldError(errors.password, copy.validation)
  const confirmPasswordError = resolveFieldError(errors.confirmPassword, copy.validation)
  const acceptTermsError = resolveFieldError(errors.acceptTerms, copy.validation)

  const updateField = <K extends keyof RegisterFormData>(
    field: K,
    value: RegisterFormData[K],
    relatedFields: (keyof RegisterFormErrors)[] = [field],
  ) => {
    const nextFormData = { ...formData, [field]: value }
    const nextErrors = validateRegister(nextFormData)

    setFormData(nextFormData)
    setErrors((current) => {
      const merged = { ...current }

      for (const relatedField of relatedFields) {
        merged[relatedField] =
          current[relatedField] !== undefined ||
          relatedField === field ||
          (field === 'password' && relatedField === 'confirmPassword')
            ? nextErrors[relatedField]
            : undefined
      }

      return merged
    })
    setBanner(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateRegister(formData)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setBanner(null)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await register({
        email: formData.email.trim(),
        username: formData.username.trim(),
        password: formData.password,
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
      pageBadge={copy.register.badge}
    >
      <section className="auth-card">
        <div className="auth-card__header">
          <span className="auth-card__badge">{copy.register.badge}</span>
          <h1>{copy.register.title}</h1>
          <p>{copy.register.subtitle}</p>
        </div>

        {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <InputField
            id="register-email"
            label={copy.register.emailLabel}
            type="email"
            value={formData.email}
            placeholder={copy.register.emailPlaceholder}
            autoComplete="email"
            icon={Mail}
            error={emailError}
            onChange={(event) => updateField('email', event.target.value)}
          />

          <InputField
            id="register-username"
            label={copy.register.usernameLabel}
            type="text"
            value={formData.username}
            placeholder={copy.register.usernamePlaceholder}
            autoComplete="nickname"
            icon={UserRound}
            error={usernameError}
            onChange={(event) => updateField('username', event.target.value)}
          />

          <PasswordField
            id="register-password"
            label={copy.register.passwordLabel}
            placeholder={copy.register.passwordPlaceholder}
            value={formData.password}
            error={passwordError}
            showLabel={copy.common.showPassword}
            hideLabel={copy.common.hidePassword}
            onChange={(password) =>
              updateField('password', password, ['password', 'confirmPassword'])
            }
          />

          <PasswordField
            id="register-confirm-password"
            label={copy.register.confirmPasswordLabel}
            placeholder={copy.register.confirmPasswordPlaceholder}
            value={formData.confirmPassword}
            error={confirmPasswordError}
            showLabel={copy.common.showPassword}
            hideLabel={copy.common.hidePassword}
            onChange={(confirmPassword) =>
              updateField('confirmPassword', confirmPassword, ['confirmPassword'])
            }
          />

          <CheckboxField
            id="accept-terms"
            checked={formData.acceptTerms}
            label={copy.register.acceptTerms}
            error={acceptTermsError}
            onChange={(acceptTerms) => updateField('acceptTerms', acceptTerms)}
          />

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? copy.common.loading : copy.register.submit}
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
          {copy.register.switchPrompt}{' '}
          <Link to="/login" className="text-link text-link--inline">
            {copy.register.switchAction}
          </Link>
        </p>
      </section>
    </AuthShell>
  )
}
