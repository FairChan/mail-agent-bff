import type {
  LoginFormData,
  LoginFormErrors,
  RegisterFormData,
  RegisterFormErrors,
} from '../types/auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const validateLogin = (data: LoginFormData): LoginFormErrors => {
  const errors: LoginFormErrors = {}

  if (!data.email.trim()) {
    errors.email = 'emailRequired'
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.email = 'invalidEmail'
  }

  if (!data.password) {
    errors.password = 'passwordRequired'
  } else if (data.password.length < 8) {
    errors.password = 'passwordLength'
  }

  return errors
}

export const validateRegister = (data: RegisterFormData): RegisterFormErrors => {
  const errors: RegisterFormErrors = {}

  if (!data.email.trim()) {
    errors.email = 'emailRequired'
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.email = 'invalidEmail'
  }

  if (!data.username.trim()) {
    errors.username = 'usernameRequired'
  }

  if (!data.password) {
    errors.password = 'passwordRequired'
  } else if (data.password.length < 8) {
    errors.password = 'passwordLength'
  }

  if (!data.confirmPassword) {
    errors.confirmPassword = 'confirmPasswordRequired'
  } else if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'passwordMismatch'
  }

  if (!data.acceptTerms) {
    errors.acceptTerms = 'acceptTermsRequired'
  }

  return errors
}
