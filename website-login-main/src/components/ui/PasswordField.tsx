import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { InputField } from './InputField'

interface PasswordFieldProps {
  id: string
  label: string
  placeholder: string
  value: string
  error?: string
  showLabel: string
  hideLabel: string
  onChange: (value: string) => void
}

export function PasswordField({
  id,
  label,
  placeholder,
  value,
  error,
  showLabel,
  hideLabel,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const autoComplete = id.includes('register') ? 'new-password' : 'current-password'

  return (
    <InputField
      id={id}
      label={label}
      type={visible ? 'text' : 'password'}
      placeholder={placeholder}
      value={value}
      error={error}
      icon={LockKeyhole}
      autoComplete={autoComplete}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          className="field__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? hideLabel : showLabel}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  )
}
