import type { ValidationCopy, ValidationMessageKey } from '../types/auth'

export const resolveFieldError = (
  value: string | undefined,
  validationCopy: ValidationCopy,
): string | undefined => {
  if (!value) {
    return undefined
  }

  if (value in validationCopy) {
    return validationCopy[value as ValidationMessageKey]
  }

  return value
}
