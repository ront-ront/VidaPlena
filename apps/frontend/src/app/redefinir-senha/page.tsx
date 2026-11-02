'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  AccessCard,
  PasswordFields,
  useOneTimeToken,
} from '@/components/access-form'
import { Button } from '@/components/ui/button'
import { LoadingState, SuccessNotice } from '@/components/ui/feedback'
import { FieldError } from '@/components/ui/field'
import {
  completePasswordReset,
  inspectPasswordReset,
} from '@/services/access-links'
import { ApiError } from '@/services/api-client'
import { publicEnv } from '@/services/env'

export default function ResetPasswordPage() {
  const { token, ready, forget } = useOneTimeToken()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [done, setDone] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [inspected, setInspected] = useState(false)
  const [inspectError, setInspectError] = useState(false)
  const [busy, setBusy] = useState(false)

  const inspect = useCallback(async (currentToken: string) => {
    setInspectError(false)
    try {
      await inspectPasswordReset(currentToken)
      setInspected(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 410) setInvalid(true)
      else setInspectError(true)
    }
  }, [])

  useEffect(() => {
    if (token) void inspect(token)
  }, [token, inspect])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || busy) return
    if (password.length < publicEnv.NEXT_PUBLIC_PASSWORD_MIN_LENGTH) {
      setPasswordError(
        `Use uma senha com pelo menos ${publicEnv.NEXT_PUBLIC_PASSWORD_MIN_LENGTH} caracteres.`,
      )
      return
    }
    if (password !== confirmation) {
      setConfirmationError(
        'As senhas não coincidem. Confira e tente novamente.',
      )
      return
    }
    setPasswordError('')
    setConfirmationError('')
    setBusy(true)
    try {
      await completePasswordReset(token, password)
      forget()
      setPassword('')
      setConfirmation('')
      setDone(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 410) setInvalid(true)
      else
        setPasswordError(
          cause instanceof ApiError
            ? cause.message
            : 'Não foi possível redefinir a senha. Tente novamente.',
        )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccessCard
      title="Definir nova senha"
      description="Escolha uma senha diferente das usadas anteriormente. Ao concluir, as sessões antigas serão encerradas."
    >
      {!ready || (token && !inspected && !invalid && !inspectError && !done) ? (
        <LoadingState label="Verificando link…" />
      ) : done ? (
        <div className="space-y-5">
          <SuccessNotice
            title="Senha atualizada"
            description="Entre novamente com sua nova senha."
          />
          <Button render={<Link href="/login" />} className="w-full">
            Ir para o login
          </Button>
        </div>
      ) : inspectError ? (
        <div className="space-y-5">
          <FieldError>
            Não foi possível verificar o link agora. Confira sua conexão e tente
            novamente.
          </FieldError>
          <Button
            className="w-full"
            onClick={() => {
              if (token) void inspect(token)
            }}
            type="button"
            variant="secondary"
          >
            Tentar novamente
          </Button>
        </div>
      ) : !token || invalid ? (
        <div className="space-y-5">
          <FieldError>
            Este link não está disponível ou já foi usado. Solicite um novo.
          </FieldError>
          <Button
            render={<Link href="/recuperar-acesso" />}
            className="w-full"
            variant="secondary"
          >
            Solicitar novo link
          </Button>
        </div>
      ) : (
        <form className="space-y-5" noValidate onSubmit={submit}>
          <PasswordFields
            confirmation={confirmation}
            passwordError={passwordError || undefined}
            confirmationError={confirmationError || undefined}
            onConfirmationChange={setConfirmation}
            onPasswordChange={setPassword}
            password={password}
          />
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? 'Salvando…' : 'Atualizar senha'}
          </Button>
        </form>
      )}
    </AccessCard>
  )
}
