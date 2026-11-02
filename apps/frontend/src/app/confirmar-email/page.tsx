'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AccessCard, useOneTimeToken } from '@/components/access-form'
import { Button } from '@/components/ui/button'
import { LoadingState, SuccessNotice } from '@/components/ui/feedback'
import { FieldError } from '@/components/ui/field'
import { ApiError } from '@/services/api-client'
import { myAccount } from '@/services/my-account'

export default function ConfirmEmailPage() {
  const { token, ready, forget } = useOneTimeToken()
  const [state, setState] = useState<'waiting' | 'done' | 'expired' | 'error'>(
    'waiting',
  )

  useEffect(() => {
    if (!token) return
    let active = true
    void myAccount
      .confirmEmail(token)
      .then(() => {
        if (active) {
          forget()
          setState('done')
        }
      })
      .catch((cause) => {
        if (active)
          setState(
            cause instanceof ApiError && cause.status === 410
              ? 'expired'
              : 'error',
          )
      })
    return () => {
      active = false
    }
  }, [token, forget])

  return (
    <AccessCard
      title="Confirmar novo e-mail"
      description="Verificamos o link enviado ao endereço novo antes de atualizar seu contato oficial."
    >
      {!ready || (token && state === 'waiting') ? (
        <LoadingState label="Confirmando contato…" />
      ) : state === 'done' ? (
        <div className="space-y-4">
          <SuccessNotice
            title="E-mail confirmado"
            description="O novo endereço já é seu contato oficial."
          />
          <Button render={<Link href="/minha-conta" />} className="w-full">
            Ir para minha conta
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <FieldError>
            {state === 'expired' || !token
              ? 'Este link expirou ou já foi usado. Solicite uma nova alteração na sua conta.'
              : 'Não foi possível confirmar agora. Tente abrir o link novamente.'}
          </FieldError>
          <Button
            render={<Link href="/minha-conta" />}
            variant="outline"
            className="w-full"
          >
            Ir para minha conta
          </Button>
        </div>
      )}
    </AccessCard>
  )
}
