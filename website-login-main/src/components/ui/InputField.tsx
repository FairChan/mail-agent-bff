import type { InputHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  error?: string
  icon?: LucideIcon
  trailing?: ReactNode
}

export function InputField({
  id,
  label,
  error,
  icon: Icon,
  trailing,
  className,
  ...props
}: InputFieldProps) {
  const describedBy = error ? `${id}-error` : undefined

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`field__control ${error ? 'has-error' : ''}`}>
        {Icon ? <Icon className="field__icon" aria-hidden="true" strokeWidth={1.75} /> : null}
        <input
          id={id}
          className={`field__input ${className ?? ''}`.trim()}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        {trailing ? <div className="field__trailing">{trailing}</div> : null}
      </div>
      <div className="field__meta">
        {error ? (
          <p id={`${id}-error`} className="field__error" role="alert">
            {error}
          </p>
        ) : (
          <span className="field__spacer" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
