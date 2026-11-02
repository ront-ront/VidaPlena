import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'

export function Label({
  className,
  htmlFor,
  children,
  ...props
}: ComponentProps<'label'> & { htmlFor: string }) {
  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    >
      {children}
    </label>
  )
}

export function FieldHelp({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-help"
      className={cn('text-[11px] leading-4 text-muted-foreground', className)}
      {...props}
    />
  )
}

export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn('text-xs leading-5 text-destructive', className)}
      {...props}
    />
  )
}

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  id: string
  label: ReactNode
  help?: string
  error?: string
}

export function TextField({
  id,
  label,
  help,
  error,
  className,
  ...props
}: TextFieldProps) {
  const describedBy = [
    props['aria-describedby'],
    help && `${id}-help`,
    error && `${id}-error`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div data-slot="field" className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...props}
        id={id}
        className={className}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
      />
      {help && <FieldHelp id={`${id}-help`}>{help}</FieldHelp>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}
