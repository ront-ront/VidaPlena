'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
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
import { FieldError, FieldHelp, TextField } from '@/components/ui/field'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/services/api-client'
import {
  type ConsentEvent,
  type Dependent,
  myAccount,
  type SubjectRequest,
} from '@/services/my-account'

type AccountData = {
  dependents: Dependent[]
  consents: ConsentEvent[]
  requests: SubjectRequest[]
}
type RequestKind = SubjectRequest['kind']

const requestNames: Record<RequestKind, string> = {
  access: 'Acesso aos dados',
  correction: 'Correção dos dados',
  export: 'Exportação dos dados',
  erasure: 'Eliminação dos dados',
}
const actionNames = { accept: 'Aceite', refuse: 'Recusa', revoke: 'Revogação' }
const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
    new Date(value),
  )

export default function MyAccountPage() {
  const { user, reloadUser } = useAuth()
  const [data, setData] = useState<AccountData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [term, setTerm] = useState<{
    id: string
    version: string
    body: string
  } | null>(null)
  const [termAccepted, setTermAccepted] = useState(false)
  const [termMessage, setTermMessage] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [kind, setKind] = useState<RequestKind>('access')
  const [description, setDescription] = useState('')
  const [requestResult, setRequestResult] = useState<{
    requestId: string
    dueAt: string
  } | null>(null)
  const [requestError, setRequestError] = useState('')
  const [exportError, setExportError] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{
    patientId: string
    versionId: string
  } | null>(null)
  const [revokeError, setRevokeError] = useState('')
  const [restricted, setRestricted] = useState(false)
  const [busy, setBusy] = useState(false)

  const patient = user?.roles.includes('patient') ?? false
  const load = useCallback(async () => {
    if (!user) return
    setLoadError(false)
    if (user.roles.includes('patient')) {
      const [dependents, consents, requests, currentTerm] =
        await Promise.allSettled([
          myAccount.dependents(),
          myAccount.consents(),
          myAccount.requests(),
          myAccount.currentTerm(),
        ])
      setData({
        dependents:
          dependents.status === 'fulfilled' ? dependents.value.items : [],
        consents: consents.status === 'fulfilled' ? consents.value.items : [],
        requests: requests.status === 'fulfilled' ? requests.value.items : [],
      })
      setTerm(currentTerm.status === 'fulfilled' ? currentTerm.value : null)
      setLoadError(
        consents.status === 'rejected' ||
          currentTerm.status === 'rejected' ||
          (user.consentState !== 'pending' &&
            (dependents.status === 'rejected' ||
              requests.status === 'rejected')),
      )
    } else setData({ dependents: [], consents: [], requests: [] })
  }, [user])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!subjectId) {
      const first = user?.patientId ?? data?.dependents[0]?.patientId
      if (first) setSubjectId(first)
    }
  }, [subjectId, user?.patientId, data?.dependents])

  const subjects = [
    ...(user?.patientId
      ? [{ patientId: user.patientId, fullName: 'Meus dados' }]
      : []),
    ...(data?.dependents.map(({ patientId, fullName }) => ({
      patientId,
      fullName,
    })) ?? []),
  ]
  const latestConsentByPatient = new Map<string, string>()
  for (const event of data?.consents ?? []) {
    if (!latestConsentByPatient.has(event.patientId))
      latestConsentByPatient.set(event.patientId, event.consentEventId)
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailError('')
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    setBusy(true)
    try {
      await myAccount.changeEmail(email.trim())
      setPendingEmail(email.trim())
      setEmail('')
    } catch (cause) {
      setEmailError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível solicitar a alteração.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError('')
    setRequestResult(null)
    if (!subjects.some((subject) => subject.patientId === subjectId)) {
      setRequestError('Selecione um titular vinculado à sua conta.')
      return
    }
    setBusy(true)
    try {
      const result = await myAccount.createRequest(
        subjectId,
        kind,
        description.trim() || undefined,
      )
      setRequestResult(result)
      setDescription('')
      await load()
    } catch (cause) {
      setRequestError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível registrar o pedido.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function confirmRevocation() {
    if (!revokeTarget) return
    setRevokeError('')
    setBusy(true)
    try {
      await myAccount.revoke(revokeTarget.patientId, revokeTarget.versionId)
      setRestricted(true)
      setRevokeTarget(null)
      // A sessão pode ser invalidada pelo servidor. O aviso local explica o próximo passo.
    } catch (cause) {
      setRevokeError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível revogar agora.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function acceptCurrentTerm() {
    if (!user?.patientId || !term || !termAccepted) return
    setBusy(true)
    setTermMessage('')
    try {
      await myAccount.accept(user.patientId, term.id)
      setTermAccepted(false)
      setTermMessage('Novo termo aceito e registrado no histórico.')
      await reloadUser()
    } catch (cause) {
      setTermMessage(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível registrar o aceite agora.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function downloadExport(id: string) {
    setExportError('')
    try {
      const payload = await myAccount.exportRequest(id)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `dados-${id}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setExportError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível baixar a exportação.',
      )
    }
  }

  if (!user) return <LoadingState />

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Área pessoal
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Minha conta
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Confira seus contatos e acompanhe consentimentos e pedidos sobre seus
          dados.
        </p>
      </div>

      {termMessage && user.consentState === 'active' && (
        <SuccessNotice title="Termo atualizado" description={termMessage} />
      )}
      {restricted && (
        <SuccessNotice
          title="Consentimento revogado"
          description="O portal e as notificações dependentes desse consentimento foram bloqueados. O prontuário e registros obrigatórios permanecem em acesso restrito. Procure a recepção para atendimento assistido."
        />
      )}
      {loadError && (
        <ErrorState
          title="Não foi possível carregar seus registros"
          nextStep="Confira sua conexão e tente novamente."
          onRetry={() => void load()}
        />
      )}

      <nav
        aria-label="Seções da conta"
        className="flex flex-wrap gap-2 text-sm"
      >
        {[
          ['dados', 'Dados e contato'],
          ['dependentes', 'Dependentes'],
          ['consentimentos', 'Consentimentos'],
          ['pedidos', 'Pedidos'],
        ]
          .filter(([id]) => patient || id === 'dados')
          .map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-border bg-card px-4 py-2 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </a>
          ))}
      </nav>

      <section id="dados" aria-labelledby="dados-title">
        <Card>
          <CardHeader>
            <CardTitle id="dados-title">Dados e contato</CardTitle>
            <CardDescription>
              Seus dados oficiais continuam até a confirmação da alteração.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <dl className="grid gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-semibold">{user.profile.fullName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">E-mail oficial</dt>
                <dd className="break-all font-semibold">
                  {user.profile.email}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Telefone</dt>
                <dd className="font-semibold">
                  {user.profile.phone || 'Não informado'}
                </dd>
              </div>
              {user.patientId && (
                <div>
                  <dt className="text-muted-foreground">
                    CPF e data de nascimento
                  </dt>
                  <dd>
                    Para corrigir, faça um pedido abaixo ou fale com a clínica.
                    A alteração é conferida e registrada pelo responsável.
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Alterar telefone</dt>
                <dd>
                  Confirme a mudança presencialmente na recepção. Não enviamos
                  código por SMS nesta versão.
                </dd>
              </div>
            </dl>
            <form className="space-y-4" onSubmit={saveEmail}>
              <TextField
                id="new-email"
                label="Novo e-mail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setEmailError('')
                }}
                error={emailError}
                placeholder="voce@exemplo.com"
              />
              <Button
                type="submit"
                disabled={busy || (patient && user.consentState !== 'active')}
              >
                Solicitar alteração
              </Button>
              {patient && user.consentState === 'pending' && (
                <FieldHelp>
                  Confirme o termo vigente para alterar seu contato.
                </FieldHelp>
              )}
              {pendingEmail && (
                <SuccessNotice
                  title="Aguardando confirmação"
                  description={`Enviamos um link para ${pendingEmail}. O endereço anterior permanece oficial até a confirmação.`}
                />
              )}
            </form>
          </CardContent>
        </Card>
      </section>

      {patient && (
        <>
          <section id="dependentes" aria-labelledby="dependentes-title">
            <Card>
              <CardHeader>
                <CardTitle id="dependentes-title">
                  Dependentes vinculados
                </CardTitle>
                <CardDescription>
                  Você só pode agir em nome de quem possui vínculo ativo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {user.consentState === 'pending' ? (
                  <EmptyState
                    title="Disponível após o aceite"
                    description="Confirme o termo vigente para consultar vínculos e pedidos."
                  />
                ) : !data ? (
                  <LoadingState />
                ) : data.dependents.length === 0 ? (
                  <EmptyState
                    title="Nenhum dependente vinculado"
                    description="Se precisar incluir um menor sob sua responsabilidade, use o cadastro ou procure a recepção."
                  />
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {data.dependents.map((item) => (
                      <li
                        key={item.patientId}
                        className="rounded-xl border border-border p-4 text-sm"
                      >
                        <p className="font-semibold">{item.fullName}</p>
                        <p className="mt-1 text-muted-foreground">
                          {item.relationship}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          <section id="consentimentos" aria-labelledby="consent-title">
            <Card>
              <CardHeader>
                <CardTitle id="consent-title">Consentimentos</CardTitle>
                <CardDescription>
                  Histórico de termos e decisões para você e seus dependentes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {user.consentState === 'pending' && user.patientId && (
                  <div className="space-y-4 rounded-xl border border-border bg-muted/40 p-4">
                    <div>
                      <h3 className="font-semibold">Novo termo disponível</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Leia a versão vigente antes de continuar a usar os
                        serviços digitais.
                      </p>
                    </div>
                    {term ? (
                      <>
                        <p className="text-sm font-semibold">
                          Versão {term.version}
                        </p>
                        <label
                          htmlFor="current-term"
                          className="text-sm font-semibold"
                        >
                          Texto completo do termo
                        </label>
                        <Textarea
                          id="current-term"
                          value={term.body}
                          readOnly
                          className="min-h-48"
                        />
                        <label className="flex items-start gap-3 text-sm leading-6">
                          <input
                            type="checkbox"
                            checked={termAccepted}
                            onChange={(event) =>
                              setTermAccepted(event.target.checked)
                            }
                            className="mt-1 size-5 accent-primary"
                          />
                          Li e aceito a versão atual do termo de dados.
                        </label>
                        <Button
                          type="button"
                          disabled={!termAccepted || busy}
                          onClick={() => void acceptCurrentTerm()}
                        >
                          Registrar aceite
                        </Button>
                      </>
                    ) : (
                      <FieldError>
                        O termo vigente não está disponível. Tente novamente
                        mais tarde ou procure a recepção.
                      </FieldError>
                    )}
                    {termMessage && (
                      <p role="status" className="text-sm">
                        {termMessage}
                      </p>
                    )}
                  </div>
                )}
                {!data ? (
                  <LoadingState />
                ) : data.consents.length === 0 ? (
                  <EmptyState
                    title="Nenhum consentimento registrado"
                    description="O histórico aparecerá aqui após o aceite ou registro presencial."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.consents.map((item) => (
                      <li
                        key={item.consentEventId}
                        className="flex flex-wrap items-start justify-between gap-3 py-4 text-sm"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold">
                            {actionNames[item.action]} · versão {item.version}
                          </p>
                          <p className="text-muted-foreground">
                            {date(item.occurredAt)} ·{' '}
                            {item.source === 'onsite' ? 'Presencial' : 'Portal'}
                            {item.actorName ? ` · ${item.actorName}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {subjects.find(
                              (subject) => subject.patientId === item.patientId,
                            )?.fullName ?? 'Titular vinculado'}
                          </p>
                        </div>
                        {item.action === 'accept' &&
                          latestConsentByPatient.get(item.patientId) ===
                            item.consentEventId &&
                          !restricted && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRevokeTarget({
                                  patientId: item.patientId,
                                  versionId: item.versionId,
                                })
                              }
                            >
                              Revogar
                            </Button>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
                {revokeTarget && (
                  <div
                    role="alertdialog"
                    aria-modal="false"
                    aria-labelledby="revoke-title"
                    aria-describedby="revoke-description"
                    className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
                  >
                    <h3 id="revoke-title" className="font-semibold">
                      Confirmar revogação?
                    </h3>
                    <p id="revoke-description" className="text-sm leading-6">
                      O acesso ao portal e as notificações baseadas neste
                      consentimento serão bloqueados. Prontuário, identificação
                      mínima, auditoria e registros fiscais legalmente
                      necessários serão preservados em acesso restrito. Para
                      continuar o atendimento, procure a recepção.
                    </p>
                    {revokeError && <FieldError>{revokeError}</FieldError>}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void confirmRevocation()}
                      >
                        Confirmar revogação
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRevokeTarget(null)}
                      >
                        Voltar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section id="pedidos" aria-labelledby="requests-title">
            <Card>
              <CardHeader>
                <CardTitle id="requests-title">
                  Pedidos sobre seus dados
                </CardTitle>
                <CardDescription>
                  Registre e acompanhe pedidos de acesso, correção, exportação
                  ou eliminação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7">
                <form
                  className="grid gap-4 md:max-w-xl"
                  onSubmit={createRequest}
                >
                  <div className="grid gap-2">
                    <label
                      htmlFor="request-subject"
                      className="text-sm font-semibold"
                    >
                      Titular
                    </label>
                    <select
                      id="request-subject"
                      className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                    >
                      {subjects.map((subject) => (
                        <option
                          key={subject.patientId}
                          value={subject.patientId}
                        >
                          {subject.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor="request-kind"
                      className="text-sm font-semibold"
                    >
                      Tipo de pedido
                    </label>
                    <select
                      id="request-kind"
                      className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                      value={kind}
                      onChange={(event) =>
                        setKind(event.target.value as RequestKind)
                      }
                    >
                      {Object.entries(requestNames).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor="request-description"
                      className="text-sm font-semibold"
                    >
                      Detalhes (opcional)
                    </label>
                    <Textarea
                      id="request-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={2000}
                    />
                  </div>
                  <FieldHelp>
                    O prazo de resposta aparece no protocolo emitido.
                  </FieldHelp>
                  {requestError && <FieldError>{requestError}</FieldError>}
                  <Button
                    type="submit"
                    disabled={
                      busy ||
                      subjects.length === 0 ||
                      user.consentState !== 'active'
                    }
                  >
                    Enviar pedido
                  </Button>
                  {requestResult && (
                    <SuccessNotice
                      title={`Pedido ${requestResult.requestId} registrado`}
                      description={`Prazo informado: ${date(requestResult.dueAt)}. Acompanhe o estado abaixo.`}
                    />
                  )}
                </form>
                <div className="space-y-3">
                  <h3 className="font-heading text-lg font-semibold">
                    Acompanhamento
                  </h3>
                  {exportError && <FieldError>{exportError}</FieldError>}
                  {user.consentState === 'pending' ? (
                    <EmptyState
                      title="Disponível após o aceite"
                      description="Confirme o termo vigente para consultar seus pedidos."
                    />
                  ) : !data ? (
                    <LoadingState />
                  ) : data.requests.length === 0 ? (
                    <EmptyState
                      title="Nenhum pedido enviado"
                      description="Seus pedidos e respostas aparecerão aqui."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {data.requests.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-xl border border-border p-4 text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>{requestNames[item.kind]}</strong>
                            <StatusBadge
                              label={
                                item.status === 'open'
                                  ? 'Em análise'
                                  : 'Concluído'
                              }
                              tone={item.status === 'open' ? 'info' : 'success'}
                            />
                          </div>
                          <p className="mt-2 break-all text-xs text-muted-foreground">
                            Protocolo {item.id}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Enviado em {date(item.submittedAt)} · prazo{' '}
                            {date(item.dueAt)}
                          </p>
                          {item.resolution?.explanation && (
                            <p className="mt-2">
                              Resposta: {item.resolution.explanation}
                            </p>
                          )}
                          {item.exportReady && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => void downloadExport(item.id)}
                            >
                              Baixar exportação
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
