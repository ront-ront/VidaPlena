'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import {
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { FieldError, FieldHelp, TextField } from '@/components/ui/field'
import {
  fieldErrors,
  type RegistrationForm,
  registrationSchema,
} from '@/lib/registration-validation'
import { ApiError } from '@/services/api-client'
import { publicEnv } from '@/services/env'
import {
  type ConsentDocument,
  currentConsentDocument,
  registerPatient,
} from '@/services/registration'

const initialForm: RegistrationForm = {
  mode: 'self',
  fullName: '',
  birthDate: '',
  cpf: '',
  phone: '',
  email: '',
  password: '',
  confirmation: '',
  guardianRelationship: '',
  accepted: false,
}

export default function RegistrationPage() {
  const { status, user } = useAuth()
  const [form, setForm] = useState<RegistrationForm>(initialForm)
  const [errors, setErrors] = useState<
    Partial<Record<keyof RegistrationForm, string>>
  >({})
  const [term, setTerm] = useState<ConsentDocument | null>(null)
  const [termError, setTermError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [duplicateCpf, setDuplicateCpf] = useState(false)
  const [message, setMessage] = useState('')

  const loadTerm = useCallback(async () => {
    setTermError(false)
    try {
      setTerm(await currentConsentDocument())
    } catch {
      setTermError(true)
    }
  }, [])

  useEffect(() => {
    void loadTerm()
  }, [loadTerm])

  function change<K extends keyof RegistrationForm>(
    field: K,
    value: RegistrationForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage('')
    if (field === 'cpf') setDuplicateCpf(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!term || busy) return
    setMessage('')
    setDuplicateCpf(false)
    const parsed = registrationSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    if (
      form.mode === 'dependent' &&
      (status !== 'authenticated' || !user?.roles.includes('patient'))
    ) {
      setMessage('Entre como responsável legal para cadastrar um dependente.')
      return
    }

    setErrors({})
    setBusy(true)
    try {
      await registerPatient({
        mode: form.mode,
        patient: {
          fullName: form.fullName.trim(),
          birthDate: form.birthDate,
          cpf: form.cpf,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
        },
        ...(form.mode === 'self' ? { password: form.password } : {}),
        ...(form.mode === 'dependent'
          ? { guardianRelationship: form.guardianRelationship.trim() }
          : {}),
        consent: { versionId: term.id, accepted: true },
      })
      setForm((current) => ({ ...current, password: '', confirmation: '' }))
      setDone(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.details.length) {
        setErrors(
          Object.fromEntries(
            cause.details.map(({ field, reason }) => [
              field
                .replace(/^patient\./, '')
                .replace('consent.accepted', 'accepted'),
              reason,
            ]),
          ),
        )
      }
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const latest = await currentConsentDocument()
          if (latest.id !== term.id) {
            setTerm(latest)
            change('accepted', false)
            setMessage(
              'O termo foi atualizado. Leia a nova versão e confirme seu aceite.',
            )
          } else {
            setDuplicateCpf(true)
            setMessage(
              'Este CPF já pode estar cadastrado. Confira ou recupere o acesso.',
            )
          }
        } catch {
          setMessage(cause.message)
        }
      } else {
        setMessage(
          cause instanceof ApiError
            ? cause.message
            : 'Não foi possível concluir o cadastro. Tente novamente.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-20">
        <SuccessNotice
          title={
            form.mode === 'self'
              ? 'Cadastro concluído'
              : 'Dependente cadastrado'
          }
          description="O aceite do termo foi registrado junto com o cadastro."
        />
        <Button
          render={
            <Link href={form.mode === 'self' ? '/login' : '/minha-conta'} />
          }
        >
          {form.mode === 'self' ? 'Entrar na minha conta' : 'Ver minha conta'}
        </Button>
      </main>
    )

  return (
    <main className="mx-auto w-full max-w-3xl min-w-0 px-4 pb-16 pt-20 sm:px-6">
      <Link
        className="text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/login"
      >
        Vida Plena · Voltar ao login
      </Link>
      <header className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-vida-blue">
          Novo cadastro
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Comece seu cuidado conosco
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Cadastre seus dados ou, se você é responsável legal, adicione um
          dependente. O termo de privacidade é apresentado antes da confirmação.
        </p>
      </header>

      {!term && !termError ? (
        <div className="mt-8">
          <LoadingState label="Carregando o termo vigente…" />
        </div>
      ) : termError ? (
        <div className="mt-8">
          <ErrorState
            title="Cadastro indisponível por enquanto"
            nextStep="Não foi possível carregar o termo vigente. Tente novamente ou contate a clínica."
            onRetry={() => void loadTerm()}
          />
        </div>
      ) : (
        <form className="mt-8 space-y-7" noValidate onSubmit={submit}>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
              >
                1
              </span>
              <h2 className="text-lg font-semibold">Quem será cadastrado?</h2>
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Tipo de cadastro</legend>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm focus-within:ring-2 focus-within:ring-ring">
                <input
                  checked={form.mode === 'self'}
                  name="registration-mode"
                  onChange={() => change('mode', 'self')}
                  type="radio"
                />
                Minha própria conta
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm focus-within:ring-2 focus-within:ring-ring">
                <input
                  checked={form.mode === 'dependent'}
                  name="registration-mode"
                  onChange={() => change('mode', 'dependent')}
                  type="radio"
                />
                Um dependente
              </label>
            </fieldset>
            {form.mode === 'dependent' && (
              <p className="mt-4 rounded-xl bg-secondary p-3 text-sm leading-6 text-secondary-foreground">
                O dependente será vinculado à sua conta de responsável legal.
                Você precisa estar conectado como paciente ou responsável.
                {status !== 'authenticated' && (
                  <>
                    {' '}
                    <Link
                      className="font-semibold underline"
                      href="/login?next=%2Fcadastro"
                    >
                      Entrar para continuar
                    </Link>
                  </>
                )}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
              >
                2
              </span>
              <h2 className="text-lg font-semibold">Dados pessoais</h2>
            </div>
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField
                  error={errors.fullName}
                  id="fullName"
                  label="Nome completo"
                  onChange={(event) => change('fullName', event.target.value)}
                  value={form.fullName}
                />
              </div>
              <TextField
                error={errors.birthDate}
                id="birthDate"
                label="Data de nascimento"
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => change('birthDate', event.target.value)}
                type="date"
                value={form.birthDate}
              />
              <TextField
                error={errors.cpf}
                id="cpf"
                inputMode="numeric"
                label="CPF"
                onChange={(event) => change('cpf', event.target.value)}
                placeholder="000.000.000-00"
                value={form.cpf}
              />
              <TextField
                error={errors.phone}
                id="phone"
                inputMode="tel"
                label={
                  form.mode === 'self'
                    ? 'Celular'
                    : 'Celular do dependente (opcional)'
                }
                onChange={(event) => change('phone', event.target.value)}
                value={form.phone}
              />
              <TextField
                error={errors.email}
                id="email"
                label={
                  form.mode === 'self'
                    ? 'E-mail'
                    : 'E-mail do dependente (opcional)'
                }
                onChange={(event) => change('email', event.target.value)}
                type="email"
                value={form.email}
              />
              {form.mode === 'dependent' ? (
                <div className="sm:col-span-2">
                  <TextField
                    error={errors.guardianRelationship}
                    id="guardianRelationship"
                    label="Seu parentesco ou vínculo legal com o dependente"
                    onChange={(event) =>
                      change('guardianRelationship', event.target.value)
                    }
                    placeholder="Ex.: mãe, pai ou tutor legal"
                    value={form.guardianRelationship}
                  />
                </div>
              ) : (
                <>
                  <TextField
                    autoComplete="new-password"
                    error={errors.password}
                    help={`Use ao menos ${publicEnv.NEXT_PUBLIC_PASSWORD_MIN_LENGTH} caracteres e evite senhas comuns.`}
                    id="password"
                    label="Senha"
                    onChange={(event) => change('password', event.target.value)}
                    type="password"
                    value={form.password}
                  />
                  <TextField
                    autoComplete="new-password"
                    error={errors.confirmation}
                    id="confirmation"
                    label="Confirme a senha"
                    onChange={(event) =>
                      change('confirmation', event.target.value)
                    }
                    type="password"
                    value={form.confirmation}
                  />
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
              >
                3
              </span>
              <h2 className="text-lg font-semibold">
                Termo de tratamento de dados
              </h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Versão {term?.version}, vigente desde{' '}
              {term?.effectiveAt
                ? new Date(term.effectiveAt).toLocaleDateString('pt-BR')
                : 'a publicação'}
              .
            </p>
            <textarea
              aria-label="Texto completo do termo de tratamento de dados"
              className="h-64 w-full resize-y overflow-y-auto rounded-xl border border-border bg-background p-4 text-sm leading-7 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              readOnly
              value={term?.body ?? ''}
            />
            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 focus-within:ring-2 focus-within:ring-ring">
              <input
                aria-describedby={errors.accepted ? 'consent-error' : undefined}
                aria-invalid={Boolean(errors.accepted)}
                checked={form.accepted}
                className="mt-1 size-5 shrink-0"
                onChange={(event) => change('accepted', event.target.checked)}
                type="checkbox"
              />
              <span>
                Li o termo vigente e aceito o tratamento dos dados para o
                serviço digital.
              </span>
            </label>
            {errors.accepted && (
              <FieldError id="consent-error">{errors.accepted}</FieldError>
            )}
            <FieldHelp className="mt-3">
              Sem o aceite, o cadastro digital não é concluído. Você pode
              procurar a clínica para conhecer as opções de atendimento
              presencial.
            </FieldHelp>
          </section>

          {message && (
            <div
              className="rounded-xl border border-border bg-card p-4"
              role="alert"
            >
              <p className="text-sm text-destructive">{message}</p>
              {duplicateCpf && (
                <Link
                  className="mt-2 inline-block text-sm font-semibold text-primary underline"
                  href="/recuperar-acesso"
                >
                  Recuperar acesso
                </Link>
              )}
            </div>
          )}
          <Button className="w-full sm:w-auto" disabled={busy} type="submit">
            {busy ? 'Concluindo…' : 'Concluir cadastro'}
          </Button>
        </form>
      )}
    </main>
  )
}
