interface ThirdPartyButtonProps {
  label: string
  onClick: () => void
}

export function ThirdPartyButton({ label, onClick }: ThirdPartyButtonProps) {
  return (
    <button type="button" className="secondary-button secondary-button--icon" onClick={onClick}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        className="secondary-button__icon"
      >
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.98-4.34 2.98-7.54Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A9.99 9.99 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.41 13.88A5.98 5.98 0 0 1 6.09 12c0-.65.11-1.29.32-1.88V7.53H3.07A9.99 9.99 0 0 0 2 12c0 1.61.38 3.14 1.07 4.47l3.34-2.59Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.98c1.47 0 2.78.5 3.81 1.48l2.86-2.86C16.96 2.98 14.69 2 12 2A9.99 9.99 0 0 0 3.07 7.53l3.34 2.59C7.2 7.74 9.4 5.98 12 5.98Z"
        />
      </svg>
      <span>{label}</span>
    </button>
  )
}
