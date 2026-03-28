interface CheckboxFieldProps {
  id: string
  checked: boolean
  label: string
  error?: string
  onChange: (checked: boolean) => void
}

export function CheckboxField({ id, checked, label, error, onChange }: CheckboxFieldProps) {
  return (
    <div className="checkbox-field">
      <label className="checkbox-field__label" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span className="checkbox-field__box" aria-hidden="true" />
        <span className="checkbox-field__text">{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="checkbox-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
