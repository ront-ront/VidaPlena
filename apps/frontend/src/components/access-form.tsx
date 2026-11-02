'use client'

import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { FieldError, FieldHelp, Label } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { publicEnv } from '@/services/env'

export function AccessCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-20 sm:px-6">
      <Link
        className="mb-8 w-fit text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/login"
      >
        Vida Plena · Voltar ao login
      </Link>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-2) sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-7">{children}</div>
      </section>
    </main>
  )
}

export function useOneTimeToken() {
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('token')
    setToken(value)
    if (value) {
      url.searchParams.delete('token')
      window.history.replaceState(
        window.history.state,
        '',
        url.pathname + url.search + url.hash,
      )
    }
    setReady(true)
  }, [])
  const forget = useCallback(() => setToken(null), [])
  return { token, ready, forget }
}

export function PasswordFields({
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
  passwordError,
  confirmationError,
}: {
  password: string
  confirmation: string
  onPasswordChange: (value: string) => void
  onConfirmationChange: (value: string) => void
  passwordError?: string
  confirmationError?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">Nova senha</Label>
        <div className="relative">
          <Input
            aria-describedby={
              passwordError ? 'password-help password-error' : 'password-help'
            }
            aria-invalid={Boolean(passwordError)}
            autoComplete="new-password"
            className="pr-12"
            id="new-password"
            onChange={(event) => onPasswordChange(event.target.value)}
            type={visible ? 'text' : 'password'}
            value={password}
          />
          <button
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setVisible((current) => !current)}
            type="button"
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        <FieldHelp id="password-help">
          Use ao menos {publicEnv.NEXT_PUBLIC_PASSWORD_MIN_LENGTH} caracteres.
          Senhas comuns ou já usadas recentemente não são aceitas.
        </FieldHelp>
        {passwordError && (
          <FieldError id="password-error">{passwordError}</FieldError>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirme a nova senha</Label>
        <Input
          aria-describedby={
            confirmationError ? 'confirmation-error' : undefined
          }
          aria-invalid={Boolean(confirmationError)}
          autoComplete="new-password"
          id="confirm-password"
          onChange={(event) => onConfirmationChange(event.target.value)}
          type="password"
          value={confirmation}
        />
        {confirmationError && (
          <FieldError id="confirmation-error">{confirmationError}</FieldError>
        )}
      </div>
    </div>
  )
}
