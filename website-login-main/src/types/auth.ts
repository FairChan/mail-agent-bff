export type Locale = 'zh' | 'en'

export interface LoginFormData {
  email: string
  password: string
  remember: boolean
}

export interface RegisterFormData {
  email: string
  username: string
  password: string
  confirmPassword: string
  acceptTerms: boolean
}

export interface BrandMetric {
  value: string
  label: string
}

export interface BrandHighlight {
  title: string
  description: string
}

export interface BrandPreviewItem {
  sender: string
  subject: string
  timestamp: string
  tone: 'sky' | 'teal' | 'sun'
}

export interface BrandCopy {
  productName: string
  overline: string
  title: string
  description: string
  floatingLabel: string
  radarTitle: string
  radarCaption: string
  previewItems: BrandPreviewItem[]
  metrics: BrandMetric[]
  highlights: BrandHighlight[]
  footer: string
}

export interface CommonCopy {
  languageLabel: string
  zhLabel: string
  enLabel: string
  loading: string
  orContinue: string
  googleAction: string
  googleFeedback: string
  showPassword: string
  hidePassword: string
}

export interface LoginCopy {
  badge: string
  title: string
  subtitle: string
  emailLabel: string
  emailPlaceholder: string
  passwordLabel: string
  passwordPlaceholder: string
  remember: string
  forgotPassword: string
  forgotFeedback: string
  submit: string
  successMessage: string
  switchPrompt: string
  switchAction: string
}

export interface RegisterCopy {
  badge: string
  title: string
  subtitle: string
  emailLabel: string
  emailPlaceholder: string
  usernameLabel: string
  usernamePlaceholder: string
  passwordLabel: string
  passwordPlaceholder: string
  confirmPasswordLabel: string
  confirmPasswordPlaceholder: string
  acceptTerms: string
  submit: string
  successMessage: string
  switchPrompt: string
  switchAction: string
}

export interface ValidationCopy {
  emailRequired: string
  invalidEmail: string
  passwordRequired: string
  passwordLength: string
  usernameRequired: string
  confirmPasswordRequired: string
  passwordMismatch: string
  acceptTermsRequired: string
}

export type ValidationMessageKey = keyof ValidationCopy
export type FieldErrorValue = ValidationMessageKey | string

export type LoginFormErrors = Partial<Record<keyof LoginFormData, FieldErrorValue>>
export type RegisterFormErrors = Partial<Record<keyof RegisterFormData, FieldErrorValue>>

export type StatusBannerTone = 'success' | 'info' | 'error'

export interface StatusBannerState {
  tone: StatusBannerTone
  message: string
}

export interface LocaleMessages {
  common: CommonCopy
  brand: BrandCopy
  login: LoginCopy
  register: RegisterCopy
  validation: ValidationCopy
}

export interface AuthPageProps {
  locale: Locale
  setLocale: (locale: Locale) => void
  copy: LocaleMessages
}
