import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import type { StatusBannerTone } from '../../types/auth'

interface StatusBannerProps {
  tone: StatusBannerTone
  message: string
}

export function StatusBanner({ tone, message }: StatusBannerProps) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : Sparkles

  return (
    <div className={`status-banner status-banner--${tone}`} role="status">
      <Icon size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
