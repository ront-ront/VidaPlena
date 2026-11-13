'use client'

import { Dialog } from '@base-ui/react/dialog'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { FieldError, FieldHelp, Label, TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/services/api-client'
import {
  type ConsentDocument,
  currentConsentDocument,
  type PublishDocumentInput,
  publishConsentDocument,
  publishDocumentSchema,
} from '@/services/consent-documents'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value))

export default function ConsentDocumentsPage() {
  const { user } = useAuth()
  const admin = !!user?.roles.includes('admin')
  const [current, setCurrent] = useState<ConsentDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [version, setVersion] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<{
    version?: string
    bodyReference?: string
  }>({})
  const [review, setReview] = useState<PublishDocumentInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [published, setPublished] = useState<Awaited<
    ReturnType<typeof publishConsentDocument>
  > | null>(null)
  const gate = useRef(false)
  const reviewButton = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setCurrent(null)
    try {
      setCurrent(await currentConsentDocument())
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404))
        setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (admin) void load()
  }, [admin, load])

  function prepareReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || loading || loadError || gate.current) return
    setMessage('')
    setPublished(null)
    const parsed = publishDocumentSchema.safeParse({
      version,
      bodyReference: body,
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      )
      return
    }
    setErrors({})
    setReview(parsed.data)
  }

  async function publish() {
    if (!review || gate.current) return
    gate.current = true
    setBusy(true)
    setMessage('')
    try {
      const receipt = await publishConsentDocument(review)
      setPublished(receipt)
      setVersion('')
      setBody('')
      setReview(null)
      await load()
    } catch (cause) {
      setReview(null)
      setMessage(
        cause instanceof ApiError && cause.status === 409
          ? 'A versão já existe ou a vigência conflita com outra publicação. Confira o termo vigente antes de tentar novamente.'
          : !(cause instanceof ApiError) ||
              cause.status === 0 ||
              cause.status >= 500
            ? 'Não foi possível confirmar a publicação. Atualize o termo vigente para conferir o resultado antes de repetir.'
            : cause.message,
      )
    } finally {
      gate.current = false
      setBusy(false)
    }
  }

  if (!user) return <LoadingState />
  if (!admin) return <ForbiddenState />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Privacidade · Administração
        </p>
        <h2 className="font-heading text-3xl font-semibold">
          Termos de consentimento
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Publique o termo de tratamento de dados para disponibilizá-lo no
          cadastro dos pacientes. Cada publicação preserva as versões
          anteriores.
        </p>
      </header>
      {published && (
        <div className="space-y-3">
          <SuccessNotice
            title="Termo publicado"
            description={`Versão ${published.version} · vigente desde ${formatDate(published.effectiveAt)}.`}
          />
          <Link
            href="/recepcao/pacientes/novo"
            className={buttonVariants({ variant: 'outline' })}
          >
            Ir para cadastro de paciente
          </Link>
        </div>
      )}
      {message && <FieldError>{message}</FieldError>}
      <Card>
        <CardHeader>
          <CardTitle>Termo vigente</CardTitle>
          <CardDescription>
            A versão apresentada nos cadastros é consultada no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <LoadingState label="Carregando termo vigente…" />
          ) : loadError ? (
            <ErrorState
              title="Não foi possível consultar o termo"
              nextStep="Tente novamente antes de publicar uma versão."
              onRetry={() => void load()}
            />
          ) : current ? (
            <>
              <p className="break-words text-sm font-semibold">
                Versão {current.version} · vigente desde{' '}
                {formatDate(current.effectiveAt)}
              </p>
              <Label htmlFor="published-term">Texto do termo vigente</Label>
              <Textarea
                id="published-term"
                value={current.body}
                readOnly
                className="min-h-56"
              />
            </>
          ) : (
            <EmptyState
              title="Nenhum termo publicado"
              description="Publique a primeira versão abaixo para liberar o cadastro de pacientes."
            />
          )}
          <Button
            type="button"
            variant="outline"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Atualizar termo vigente
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Publicar nova versão</CardTitle>
          <CardDescription>
            A vigência será imediata, a partir da publicação. Confira o texto
            antes de confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={prepareReview} noValidate className="space-y-5">
            <TextField
              id="term-version"
              label="Versão"
              value={version}
              error={errors.version}
              disabled={busy}
              help="Identifique cada publicação com uma versão diferente."
              onChange={(event) => {
                setVersion(event.target.value)
                setErrors((previous) => ({ ...previous, version: undefined }))
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="term-body">Texto completo do termo</Label>
              <Textarea
                id="term-body"
                className="min-h-64"
                value={body}
                disabled={busy}
                aria-invalid={!!errors.bodyReference}
                aria-describedby={
                  errors.bodyReference
                    ? 'term-body-help term-body-error'
                    : 'term-body-help'
                }
                onChange={(event) => {
                  setBody(event.target.value)
                  setErrors((previous) => ({
                    ...previous,
                    bodyReference: undefined,
                  }))
                }}
              />
              <FieldHelp id="term-body-help">
                Insira o texto que será apresentado ao paciente antes do aceite.
              </FieldHelp>
              {errors.bodyReference && (
                <FieldError id="term-body-error">
                  {errors.bodyReference}
                </FieldError>
              )}
            </div>
            <Button
              type="submit"
              ref={reviewButton}
              disabled={busy || loading || loadError}
            >
              Revisar publicação
            </Button>
          </form>
        </CardContent>
      </Card>
      <Dialog.Root
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !gate.current) setReview(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/35" />
          <Dialog.Popup
            finalFocus={reviewButton}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-(--shadow-3) focus:outline-none sm:p-7"
          >
            <Dialog.Title className="font-heading text-xl font-semibold">
              Revisar publicação do termo
            </Dialog.Title>
            <Dialog.Description className="text-sm leading-6 text-muted-foreground">
              A publicação é definitiva e pode exigir novo aceite dos pacientes.
              Para corrigir um termo publicado, será necessário criar outra
              versão.
            </Dialog.Description>
            <p className="break-words text-sm font-semibold">
              Versão {review?.version} · Vigência imediata
            </p>
            <Label htmlFor="review-term-body">Texto que será publicado</Label>
            <Textarea
              id="review-term-body"
              readOnly
              value={review?.bodyReference ?? ''}
              className="min-h-56"
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void publish()}
              >
                {busy ? 'Publicando…' : 'Confirmar publicação'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Voltar para editar
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
