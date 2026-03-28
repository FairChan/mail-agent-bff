import type {
  AuthErrorCode,
  AuthErrorResponse,
  AuthField,
} from '../../shared/auth'
import type { Locale, ValidationCopy } from '../types/auth'
import { resolveFieldError } from './formErrors'

const AUTH_ERROR_MESSAGES: Record<Locale, Record<AuthErrorCode, string>> = {
  zh: {
    VALIDATION_ERROR: '请检查高亮字段后再继续。',
    INVALID_CREDENTIALS: '邮箱或密码不正确。',
    EMAIL_ALREADY_EXISTS: '该邮箱已经注册过了。',
    UNAUTHORIZED: '会话已失效，请重新登录。',
    UPSTREAM_UNAVAILABLE: '认证服务暂时不可用，请稍后重试。',
    UNKNOWN_ERROR: '发生未知错误，请稍后重试。',
  },
  en: {
    VALIDATION_ERROR: 'Please review the highlighted fields and try again.',
    INVALID_CREDENTIALS: 'The email or password is incorrect.',
    EMAIL_ALREADY_EXISTS: 'That email is already registered.',
    UNAUTHORIZED: 'Your session has expired. Please sign in again.',
    UPSTREAM_UNAVAILABLE: 'The auth service is temporarily unavailable.',
    UNKNOWN_ERROR: 'Something went wrong. Please try again later.',
  },
}

const FIELD_FALLBACKS: Record<Locale, Partial<Record<AuthField, string>>> = {
  zh: {
    email: '请检查邮箱地址。',
    password: '请检查密码。',
    username: '请检查显示名称。',
  },
  en: {
    email: 'Please check the email address.',
    password: 'Please check the password.',
    username: 'Please check the display name.',
  },
}

export interface ResolvedAuthFeedback {
  message: string
  fieldErrors: Partial<Record<AuthField, string>>
}

export const resolveAuthFeedback = (
  locale: Locale,
  error: AuthErrorResponse,
  validationCopy: ValidationCopy,
): ResolvedAuthFeedback => {
  const message =
    AUTH_ERROR_MESSAGES[locale][error.code] ??
    error.message ??
    AUTH_ERROR_MESSAGES[locale].UNKNOWN_ERROR

  const fieldErrors: Partial<Record<AuthField, string>> = {}

  for (const [field, value] of Object.entries(error.fieldErrors ?? {}) as Array<
    [AuthField, string]
  >) {
    const resolved = resolveFieldError(value, validationCopy)
    fieldErrors[field] =
      resolved ??
      AUTH_ERROR_MESSAGES[locale][value as AuthErrorCode] ??
      value
  }

  if (!fieldErrors.email && error.code === 'EMAIL_ALREADY_EXISTS') {
    fieldErrors.email = FIELD_FALLBACKS[locale].email
  }

  if (!fieldErrors.password && error.code === 'INVALID_CREDENTIALS') {
    fieldErrors.password = FIELD_FALLBACKS[locale].password
  }

  if (!fieldErrors.username && error.code === 'VALIDATION_ERROR' && error.fieldErrors?.username) {
    fieldErrors.username =
      resolveFieldError(error.fieldErrors.username, validationCopy) ??
      FIELD_FALLBACKS[locale].username
  }

  return {
    message,
    fieldErrors,
  }
}

export const resolveAuthErrorMessage = (locale: Locale, error: AuthErrorResponse): string =>
  error.message ?? AUTH_ERROR_MESSAGES[locale][error.code] ?? AUTH_ERROR_MESSAGES[locale].UNKNOWN_ERROR
