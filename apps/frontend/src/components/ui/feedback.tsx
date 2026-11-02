import { CircleAlert, CircleCheck, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'

export function LoadingState({
  label = 'Carregando informações…',
}: {
  label?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-32 items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-5 animate-spin motion-reduce:animate-none"
      />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
      <Inbox aria-hidden="true" className="mb-3 size-7 text-muted-foreground" />
      <h3 className="font-heading text-lg font-semibold text-card-foreground">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title,
  nextStep,
  onRetry,
  retryLabel = 'Tentar novamente',
}: {
  title: string
  nextStep: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-(--shadow-1)"
    >
      <div className="flex items-start gap-3">
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {nextStep}
          </p>
          {onRetry && (
            <Button className="mt-4" onClick={onRetry} variant="outline">
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function SuccessNotice({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-xl bg-status-success-background px-4 py-3 text-sm text-status-success-foreground"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-0.5 leading-5">{description}</p>}
      </div>
    </div>
  )
}
