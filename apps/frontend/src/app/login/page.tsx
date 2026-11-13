'use client'

import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import { FieldError, FieldHelp, TextField } from '@/components/ui/field'
import { type AppRole, destinationForPath } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { ApiError } from '@/services/api-client'
import { enrollMfa, type LoginResult, login, verifyMfa } from '@/services/auth'

type FieldErrors = {
  identifier?: string
  password?: string
  code?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function safeDestination(roles: readonly AppRole[]) {
  const next = new URLSearchParams(window.location.search).get('next')
  if (next === '/cadastro' && roles.includes('patient')) return next
  const match = next ? destinationForPath(next) : undefined
  return match && roles.some((role) => match.roles.includes(role)) && next
    ? next
    : '/minha-conta'
}

export default function LoginPage() {
  const router = useRouter()
  const { status, activateSession } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [challenge, setChallenge] = useState<Extract<
    LoginResult,
    { status: 'mfa_required' }
  > | null>(null)
  const [enrollment, setEnrollment] = useState<{
    secret: string
    otpauthUri: string
  } | null>(null)
  const [code, setCode] = useState('')
  const challengeHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (challenge) challengeHeading.current?.focus()
  }, [challenge])

  async function completeAuthentication(tokens: {
    accessToken: string
    expiresAt: string
  }) {
    const user = await activateSession(tokens)
    router.replace(safeDestination(user.roles))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || status === 'loading') return

    const errors: FieldErrors = {}
    const normalizedIdentifier = identifier.trim()

    if (!normalizedIdentifier) {
      errors.identifier = 'Informe seu e-mail ou CPF.'
    } else if (
      !emailPattern.test(normalizedIdentifier) &&
      normalizedIdentifier.replace(/\D/g, '').length !== 11
    ) {
      errors.identifier = 'Digite um e-mail ou CPF válido.'
    }

    if (!password) {
      errors.password = 'Informe sua senha.'
    }

    setFieldErrors(errors)
    setFormMessage('')

    if (Object.keys(errors).length > 0) {
      return
    }

    setIsSubmitting(true)
    try {
      const result = await login(normalizedIdentifier, password)
      setPassword('')
      if (result.status === 'mfa_required') {
        setChallenge(result)
        if (result.enrollmentRequired)
          setEnrollment(await enrollMfa(result.challengeId))
      } else {
        await completeAuthentication(result)
      }
    } catch (error) {
      setFormMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível entrar. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!challenge || isSubmitting) return
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: 'Digite os seis números exibidos no aplicativo.' })
      return
    }
    setFieldErrors({})
    setFormMessage('')
    setIsSubmitting(true)
    try {
      await completeAuthentication(await verifyMfa(challenge.challengeId, code))
      setCode('')
      setEnrollment(null)
    } catch (error) {
      setFormMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível confirmar o código. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -left-32 top-20 size-80 rounded-full bg-[radial-gradient(circle,var(--accent),transparent_68%)] opacity-80" />
      <div className="pointer-events-none absolute -right-32 bottom-0 size-96 rounded-full bg-[radial-gradient(circle,var(--secondary),transparent_68%)] opacity-80" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-360 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
        <section className="flex flex-col px-6 pb-10 pt-8 sm:px-10 sm:pt-10 lg:justify-center lg:px-16 lg:py-16">
          <div className="mx-auto w-full max-w-xl lg:mx-0">
            <div className="mb-16 flex items-center gap-3 lg:mb-24">
              {/* <div className="relative flex size-10.5 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,var(--vida-mint),var(--vida-blue)_52%,var(--vida-blue-deep))] shadow-(--shadow-2)"> */}
              <Image
                src="/logo.png"
                alt="Vida Plena Logo"
                width={58}
                height={58}
              />
              {/* </div> */}
              <span className="font-heading text-2xl font-bold tracking-tight">
                <span className="text-vida-blue">Vida</span>
                <span className="text-vida-mint">Plena</span>
              </span>
            </div>

            <div className="max-w-lg">
              <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-vida-blue">
                <span className="size-1.5 rounded-full bg-vida-mint" />
                Cuidado conectado
              </p>
              <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-[-0.04em] text-foreground sm:text-5xl sm:leading-[1.12]">
                Um espaço para cuidar do que realmente importa.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
                Acompanhe sua jornada de cuidado com clareza, segurança e uma
                experiência feita para colocar você no centro.
              </p>
            </div>

            <div className="mt-12 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <span>Seus dados tratados com cuidado e privacidade.</span>
            </div>
          </div>
        </section>

        <section className="flex items-center px-4 pb-10 sm:px-8 lg:px-10 lg:py-10">
          <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-(--shadow-2) sm:p-8">
            {challenge ? (
              <>
                <button
                  className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setChallenge(null)
                    setEnrollment(null)
                    setCode('')
                    setFormMessage('')
                  }}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Voltar ao login
                </button>
                <p className="mb-2 text-sm font-semibold text-vida-blue">
                  Verificação em duas etapas
                </p>
                <h2
                  className="text-2xl font-bold"
                  ref={challengeHeading}
                  tabIndex={-1}
                >
                  Confirme seu acesso
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Abra seu aplicativo autenticador e digite o código temporário
                  de seis números.
                </p>
                {challenge.enrollmentRequired && enrollment && (
                  <div className="mt-6 rounded-xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">
                    <h3 className="font-semibold">
                      Primeiro acesso: configure o autenticador
                    </h3>
                    <ol className="mt-2 list-inside list-decimal space-y-1 leading-6">
                      <li>
                        Abra um aplicativo autenticador compatível com TOTP.
                      </li>
                      <li>
                        Adicione uma conta escaneando o QR code ou informe a
                        chave manual abaixo.
                      </li>
                      <li>
                        Use o código exibido pelo aplicativo para confirmar.
                      </li>
                    </ol>
                    <div className="mt-4 flex justify-center">
                      <QRCodeSVG
                        aria-label="QR code para configurar o autenticador"
                        className="h-auto max-w-full rounded-lg"
                        level="M"
                        marginSize={4}
                        role="img"
                        size={200}
                        title="Escaneie com seu aplicativo autenticador"
                        value={enrollment.otpauthUri}
                      />
                    </div>
                    <p className="mt-4 font-semibold">
                      Ou copie a chave para configurar manualmente:
                    </p>
                    <code className="mt-3 block break-all rounded-lg bg-card px-3 py-2 font-mono text-base tracking-wider text-card-foreground">
                      {enrollment.secret}
                    </code>
                    <p className="mt-2 text-xs">
                      Esta chave aparece só durante esta etapa. Não compartilhe.
                    </p>
                  </div>
                )}
                <form
                  className="mt-6 space-y-5"
                  noValidate
                  onSubmit={handleMfa}
                >
                  <TextField
                    autoComplete="one-time-code"
                    error={fieldErrors.code}
                    id="mfa-code"
                    inputMode="numeric"
                    label="Código do autenticador"
                    maxLength={6}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ''))
                    }
                    placeholder="000000"
                    value={code}
                  />
                  {formMessage && <FieldError>{formMessage}</FieldError>}
                  <Button
                    className="w-full"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting && (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    )}
                    Confirmar código
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <p className="mb-3 text-sm font-semibold text-vida-blue">
                    Acesse sua conta
                  </p>
                  <h2 className="text-2xl font-bold tracking-tight text-card-foreground sm:text-3xl">
                    Bem-vindo de volta
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                    Entre para continuar sua jornada de cuidado no Vida Plena.
                  </p>
                </div>

                <form className="space-y-5" noValidate onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold text-card-foreground"
                      htmlFor="identifier"
                    >
                      E-mail ou CPF
                    </label>
                    <input
                      aria-describedby={
                        fieldErrors.identifier ? 'identifier-error' : undefined
                      }
                      aria-invalid={Boolean(fieldErrors.identifier)}
                      autoComplete="username"
                      className={cn(
                        'h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/20',
                        fieldErrors.identifier &&
                          'border-destructive focus:border-destructive focus:ring-destructive/20',
                      )}
                      id="identifier"
                      name="identifier"
                      onChange={(event) => {
                        setIdentifier(event.target.value)
                        if (fieldErrors.identifier) {
                          setFieldErrors((current) => ({
                            ...current,
                            identifier: undefined,
                          }))
                        }
                      }}
                      placeholder="seu@email.com ou CPF"
                      value={identifier}
                    />
                    {fieldErrors.identifier && (
                      <p
                        className="flex items-center gap-1.5 text-xs text-destructive"
                        id="identifier-error"
                        role="alert"
                      >
                        <CircleAlert aria-hidden="true" className="size-3.5" />
                        {fieldErrors.identifier}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <label
                        className="text-sm font-semibold text-card-foreground"
                        htmlFor="password"
                      >
                        Senha
                      </label>
                      <Link
                        className="text-xs font-semibold cursor-pointer text-primary underline-offset-4 transition-colors hover:text-vida-blue hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                        href="/recuperar-acesso"
                      >
                        Esqueci minha senha
                      </Link>
                    </div>
                    <div className="relative">
                      <input
                        aria-describedby={
                          fieldErrors.password ? 'password-error' : undefined
                        }
                        aria-invalid={Boolean(fieldErrors.password)}
                        autoComplete="current-password"
                        className={cn(
                          'h-11 w-full rounded-[10px] border border-input bg-background px-3 pr-11 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/20',
                          fieldErrors.password &&
                            'border-destructive focus:border-destructive focus:ring-destructive/20',
                        )}
                        id="password"
                        name="password"
                        onChange={(event) => {
                          setPassword(event.target.value)
                          if (fieldErrors.password) {
                            setFieldErrors((current) => ({
                              ...current,
                              password: undefined,
                            }))
                          }
                        }}
                        placeholder="Digite sua senha"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                      />
                      <button
                        aria-label={
                          showPassword ? 'Ocultar senha' : 'Mostrar senha'
                        }
                        className="absolute cursor-pointer right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                        onClick={() => setShowPassword((current) => !current)}
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" className="size-4" />
                        ) : (
                          <Eye aria-hidden="true" className="size-4" />
                        )}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p
                        className="flex items-center gap-1.5 text-xs text-destructive"
                        id="password-error"
                        role="alert"
                      >
                        <CircleAlert aria-hidden="true" className="size-3.5" />
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  <Button
                    className="h-12 w-full rounded-[11px] text-sm font-semibold shadow-(--shadow-1)"
                    disabled={isSubmitting || status === 'loading'}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                        Entrando…
                      </>
                    ) : (
                      <>
                        Entrar
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </>
                    )}
                  </Button>

                  {formMessage && <FieldError>{formMessage}</FieldError>}
                  <FieldHelp>
                    Usuários internos confirmam o acesso com um aplicativo
                    autenticador.
                  </FieldHelp>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
