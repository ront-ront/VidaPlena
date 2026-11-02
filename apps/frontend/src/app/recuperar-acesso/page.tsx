'use client'

import { type FormEvent, useState } from 'react'
import { AccessCard } from '@/components/access-form'
import { Button } from '@/components/ui/button'
import { SuccessNotice } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { requestPasswordReset } from '@/services/access-links'
import { ApiError } from '@/services/api-client'

const publicMessage =
  'Se existir uma conta com esses dados, enviaremos um link de recuperação para o e-mail cadastrado.'

export default function RecoveryPage() {
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!identifier.trim()) {
      setError('Informe seu e-mail ou CPF.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(identifier.trim())
      setSent(true)
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível enviar. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccessCard
      title="Recuperar acesso"
      description="Informe seu e-mail ou CPF para receber as instruções de redefinição de senha."
    >
      {sent ? (
        <SuccessNotice
          title="Solicitação recebida"
          description={publicMessage}
        />
      ) : (
        <form className="space-y-5" noValidate onSubmit={submit}>
          <TextField
            autoComplete="username"
            error={error || undefined}
            id="recovery-identifier"
            label="E-mail ou CPF"
            onChange={(event) => setIdentifier(event.target.value)}
            value={identifier}
          />
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? 'Enviando…' : 'Enviar instruções'}
          </Button>
        </form>
      )}
    </AccessCard>
  )
}
