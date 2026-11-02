import { CircleAlert, CircleCheck, CircleDot, Clock3, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusTone = 'info' | 'success' | 'warning' | 'error' | 'neutral'

const toneStyle: Record<StatusTone, string> = {
  info: 'bg-status-info-background text-status-info-foreground',
  success: 'bg-status-success-background text-status-success-foreground',
  warning: 'bg-status-warning-background text-status-warning-foreground',
  error: 'bg-status-error-background text-status-error-foreground',
  neutral: 'bg-status-neutral-background text-status-neutral-foreground',
}

const toneIcon = {
  info: Info,
  success: CircleCheck,
  warning: Clock3,
  error: CircleAlert,
  neutral: CircleDot,
}

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone
  label: string
  className?: string
}) {
  const Icon = toneIcon[tone]
  return (
    <span
      data-slot="status-badge"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[11px] font-bold leading-4',
        toneStyle[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}
