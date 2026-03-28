import type { AuthErrorResponse, AuthField, FieldErrors, LoginRequestBody, RegisterRequestBody } from '../types.js'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function addFieldError(errors: FieldErrors, field: AuthField, message: string): FieldErrors {
  return {
    ...errors,
    [field]: message,
  }
}

export function validateLoginInput(input: Partial<LoginRequestBody>): AuthErrorResponse | null {
  let fieldErrors: FieldErrors = {}

  if (!isNonEmptyString(input.email)) {
    fieldErrors = addFieldError(fieldErrors, 'email', 'emailRequired')
  } else if (!isEmailFormat(input.email.trim())) {
    fieldErrors = addFieldError(fieldErrors, 'email', 'invalidEmail')
  }

  if (!isNonEmptyString(input.password)) {
    fieldErrors = addFieldError(fieldErrors, 'password', 'passwordRequired')
  }

  if (Object.keys(fieldErrors).length === 0) {
    return null
  }

  return {
    code: 'VALIDATION_ERROR',
    fieldErrors,
  }
}

export function validateRegisterInput(input: Partial<RegisterRequestBody>): AuthErrorResponse | null {
  let fieldErrors: FieldErrors = {}

  if (!isNonEmptyString(input.email)) {
    fieldErrors = addFieldError(fieldErrors, 'email', 'emailRequired')
  } else if (!isEmailFormat(input.email.trim())) {
    fieldErrors = addFieldError(fieldErrors, 'email', 'invalidEmail')
  }

  if (!isNonEmptyString(input.username)) {
    fieldErrors = addFieldError(fieldErrors, 'username', 'usernameRequired')
  }

  if (!isNonEmptyString(input.password)) {
    fieldErrors = addFieldError(fieldErrors, 'password', 'passwordRequired')
  } else if (input.password.trim().length < 8) {
    fieldErrors = addFieldError(fieldErrors, 'password', 'passwordLength')
  }

  if (Object.keys(fieldErrors).length === 0) {
    return null
  }

  return {
    code: 'VALIDATION_ERROR',
    fieldErrors,
  }
}
