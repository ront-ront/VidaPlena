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
  acceptInvitation,
  type Invitation,
  inspectInvitation,
} from '@/services/access-links'
import { ApiError } from '@/services/api-client'
import { publicEnv } from '@/services/env'

const roleLabels: Record<string, string> = {
  receptionist: 'Recepção',
  professional: 'Profissional de saúde',
  manager: 'Gestor',
  admin: 'Administrador',
}

export default function InvitationPage() {
  const { token, ready, forget } = useOneTimeToken()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [inspectError, setInspectError] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const verifyInvitation = useCallback(async (currentToken: string) => {
    setInspectError(false)
    try {
      setInvitation(await inspectInvitation(currentToken))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 410) setInvalid(true)
      else setInspectError(true)
    }
  }, [])

  useEffect(() => {
    if (token) void verifyInvitation(token)
  }, [token, verifyInvitation])

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
      await acceptInvitation(token, password)
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
            : 'Não foi possível ativar sua conta. Tente novamente.',
        )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccessCard
      title="Ativar acesso à clínica"
      description="Confirme o convite e defina uma senha para sua conta interna."
    >
      {!ready ||
      (token && !invitation && !invalid && !inspectError && !done) ? (
        <LoadingState label="Verificando convite…" />
      ) : done ? (
        <div className="space-y-5">
          <SuccessNotice
            title="Conta ativada"
            description="Entre com sua senha. O acesso interno também solicitará o aplicativo autenticador."
          />
          <Button render={<Link href="/login" />} className="w-full">
            Ir para o login
          </Button>
        </div>
      ) : inspectError ? (
        <div className="space-y-4">
          <FieldError>
            Não foi possível verificar o convite agora. Confira sua conexão e
            tente novamente.
          </FieldError>
          <Button
            className="w-full"
            onClick={() => {
              if (token) void verifyInvitation(token)
            }}
            type="button"
            variant="secondary"
          >
            Tentar novamente
          </Button>
        </div>
      ) : !token || invalid ? (
        <div className="space-y-4">
          <FieldError>
            Este convite expirou ou já foi usado. Solicite um novo convite ao
            administrador da clínica.
          </FieldError>
          <Button
            render={<Link href="/login" />}
            className="w-full"
            variant="secondary"
          >
            Voltar ao login
          </Button>
        </div>
      ) : (
        <div>
          <div className="mb-6 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
            <p className="font-semibold">{invitation?.fullName}</p>
            <p className="mt-1">
              Perfil:{' '}
              {invitation?.roles
                .map((role) => roleLabels[role] ?? 'Equipe')
                .join(', ')}
            </p>
            <p className="mt-1">
              Válido até{' '}
              {invitation?.expiresAt
                ? new Date(invitation.expiresAt).toLocaleString('pt-BR')
                : 'o prazo indicado no e-mail'}
              .
            </p>
          </div>
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
              {busy ? 'Ativando…' : 'Ativar conta'}
            </Button>
          </form>
        </div>
      )}
    </AccessCard>
  )
}
