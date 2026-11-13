'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { ConsentTermState } from '@/components/consent-term-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { FieldError, FieldHelp, TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { Textarea } from '@/components/ui/textarea'
import {
  checkSignedTerm,
  minorAt,
  patientSchema,
} from '@/lib/onsite-validation'
import { ApiError } from '@/services/api-client'
import { publicEnv } from '@/services/env'
import { onsiteRegistration } from '@/services/onsite-registration'
import {
  type ConsentDocument,
  currentConsentDocument,
} from '@/services/registration'

type PatientInput = {
  fullName: string
  birthDate: string
  cpf: string
  phone: string
  email: string
}
type Receipt = Awaited<
  ReturnType<typeof onsiteRegistration.receipts>
>['items'][number]
type Props = { mode: 'new' | 'existing'; patientId?: string }
const initialPatient: PatientInput = {
  fullName: '',
  birthDate: '',
  cpf: '',
  phone: '',
  email: '',
}
const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export function OnsiteConsentForm({ mode, patientId }: Props) {
  const { user } = useAuth()
  const [patient, setPatient] = useState<PatientInput>(initialPatient)
  const [patientErrors, setPatientErrors] = useState<
    Partial<Record<keyof PatientInput, string>>
  >({})
  const [term, setTerm] = useState<ConsentDocument | null>(null)
  const [termError, setTermError] = useState<'missing' | 'error' | null>(null)
  const lastVersion = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileValidation = useRef(0)
  const [existingCpf, setExistingCpf] = useState('')
  const [existingMatch, setExistingMatch] = useState<{
    patientId: string
    fullName: string
    birthDate: string
  } | null>(null)
  const [existingError, setExistingError] = useState('')
  const [representing, setRepresenting] = useState(false)
  const [guardianIdentifier, setGuardianIdentifier] = useState('')
  const [guardian, setGuardian] = useState<{
    userId: string
    fullName: string
  } | null>(null)
  const [guardianError, setGuardianError] = useState('')
  const [relationship, setRelationship] = useState('')
  const [relationshipError, setRelationshipError] = useState('')
  const [consentingPersonName, setConsentingPersonName] = useState('')
  const [consentingError, setConsentingError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [acceptedError, setAcceptedError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{
    patientId: string
    consentEventId: string
    signedFileId: string
    accountState?: string
  } | null>(null)
  const [receipts, setReceipts] = useState<Receipt[] | null>(null)
  const [receiptError, setReceiptError] = useState(false)

  const allowed = !!user?.roles.some(
    (role) => role === 'receptionist' || role === 'admin',
  )
  const birthDate =
    mode === 'new'
      ? patient.birthDate
      : (existingMatch?.birthDate?.slice(0, 10) ?? '')
  const minor = minorAt(birthDate)
  const needGuardian = minor || representing

  const loadTerm = useCallback(async () => {
    setTermError(null)
    setTerm(null)
    try {
      const next = await currentConsentDocument()
      if (lastVersion.current && lastVersion.current !== next.id) {
        fileValidation.current++
        setAccepted(false)
        setAcceptedError('')
        setFile(null)
        setFileError('')
        if (fileInput.current) fileInput.current.value = ''
        setMessage(
          'O termo foi atualizado. Leia a nova versão, confira a assinatura e anexe o novo termo assinado.',
        )
      }
      lastVersion.current = next.id
      setTerm(next)
    } catch (cause) {
      setTermError(
        cause instanceof ApiError && cause.status === 404 ? 'missing' : 'error',
      )
    }
  }, [])
  const loadReceipts = useCallback(async () => {
    if (!patientId) return
    setReceiptError(false)
    try {
      setReceipts((await onsiteRegistration.receipts(patientId)).items)
    } catch {
      setReceiptError(true)
    }
  }, [patientId])

  useEffect(() => {
    if (allowed) void loadTerm()
  }, [allowed, loadTerm])
  useEffect(() => {
    if (allowed && mode === 'existing') void loadReceipts()
  }, [allowed, mode, loadReceipts])

  function changePatient<K extends keyof PatientInput>(
    field: K,
    value: PatientInput[K],
  ) {
    setPatient((current) => ({ ...current, [field]: value }))
    setPatientErrors((current) => ({ ...current, [field]: undefined }))
    setMessage('')
  }

  async function lookupExisting() {
    setExistingError('')
    setExistingMatch(null)
    try {
      const found = await onsiteRegistration.lookupPatient(existingCpf.trim())
      if (mode === 'existing' && found.patientId !== patientId) {
        setExistingError(
          'O CPF informado pertence a outro cadastro. Confira a identificação do paciente.',
        )
        return
      }
      setExistingMatch(found)
    } catch (cause) {
      setExistingError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível localizar o cadastro.',
      )
    }
  }

  async function lookupGuardian() {
    setGuardianError('')
    setGuardian(null)
    try {
      const found = await onsiteRegistration.lookupGuardian(
        guardianIdentifier.trim(),
      )
      setGuardian(found)
      if (!consentingPersonName) setConsentingPersonName(found.fullName)
    } catch (cause) {
      setGuardianError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível localizar o responsável.',
      )
    }
  }

  async function pickFile(filePicked: File | null) {
    const attempt = ++fileValidation.current
    const versionId = lastVersion.current
    setFile(null)
    setFileError('')
    if (!filePicked) return
    try {
      const problem = await checkSignedTerm(filePicked)
      if (
        attempt !== fileValidation.current ||
        versionId !== lastVersion.current
      )
        return
      if (problem) setFileError(problem)
      else setFile(filePicked)
    } catch {
      if (
        attempt !== fileValidation.current ||
        versionId !== lastVersion.current
      )
        return
      setFileError('Não foi possível ler o arquivo. Escolha outro.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !term) return
    setMessage('')
    setResult(null)
    let invalid = false
    if (mode === 'new') {
      const parsed = patientSchema.safeParse(patient)
      if (!parsed.success) {
        setPatientErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
          ),
        )
        invalid = true
      }
    } else if (!existingMatch || existingMatch.patientId !== patientId) {
      setExistingError('Confirme o CPF do paciente antes de registrar o termo.')
      invalid = true
    }
    if (needGuardian && !guardian) {
      setGuardianError('Localize e confirme o responsável legal.')
      invalid = true
    }
    if (needGuardian && !relationship.trim()) {
      setRelationshipError('Informe o parentesco ou vínculo legal.')
      invalid = true
    }
    if (!consentingPersonName.trim()) {
      setConsentingError('Informe o nome de quem assinou.')
      invalid = true
    }
    if (!accepted) {
      setAcceptedError('Confirme que a pessoa assinou a versão indicada.')
      invalid = true
    }
    if (!file) {
      setFileError('Anexe o termo assinado em PDF, JPG ou PNG.')
      invalid = true
    }
    if (invalid || !file) return

    setBusy(true)
    try {
      const consent = {
        versionId: term.id,
        consentingPersonName: consentingPersonName.trim(),
        ...(needGuardian && guardian
          ? {
              guardianUserId: guardian.userId,
              consentingRelationship: relationship.trim(),
            }
          : {}),
        accepted: true as const,
      }
      if (mode === 'new') {
        const created = await onsiteRegistration.register(
          {
            fullName: patient.fullName.trim(),
            birthDate: patient.birthDate,
            cpf: patient.cpf,
            phone: patient.phone || undefined,
            email: patient.email || undefined,
          },
          consent,
          file,
          needGuardian ? relationship.trim() : undefined,
        )
        setResult(created)
      } else if (patientId) {
        const created = await onsiteRegistration.consent(
          patientId,
          consent,
          file,
        )
        setResult({ patientId, ...created })
        await loadReceipts()
      }
      setFile(null)
      setAccepted(false)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setMessage(
          mode === 'new'
            ? 'CPF já cadastrado ou termo desatualizado. Confira o cadastro existente e atualize o termo antes de tentar novamente.'
            : 'O termo foi atualizado ou já registrado. Recarregue a versão vigente e tente novamente.',
        )
        void loadTerm()
      } else if (cause instanceof ApiError && cause.status === 422)
        setFileError(cause.message)
      else
        setMessage(
          cause instanceof ApiError
            ? cause.message
            : 'Não foi possível concluir. Tente novamente.',
        )
    } finally {
      setBusy(false)
    }
  }

  if (!user) return <LoadingState />
  if (!allowed) return <ForbiddenState />

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Recepção · Cadastro assistido
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {mode === 'new'
            ? 'Cadastrar paciente presencialmente'
            : 'Registrar novo termo presencial'}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Confira a identidade da pessoa, registre quem assinou e anexe o termo
          antes de confirmar.
        </p>
      </div>
      {result && (
        <SuccessNotice
          title={
            mode === 'new'
              ? 'Paciente cadastrado e termo registrado'
              : 'Novo aceite presencial registrado'
          }
          description={`Paciente ${result.patientId} · consentimento ${result.consentEventId} · evidência ${result.signedFileId}. ${result.accountState === 'invited' ? 'Convite de acesso enviado ao adulto.' : result.accountState === 'assisted' ? (needGuardian ? 'Acesso digital pelo responsável vinculado.' : 'Atendimento assistido, sem conta digital ativa.') : ''}`}
        />
      )}
      {result && mode === 'new' && (
        <Button
          render={
            <Link
              href={`/recepcao/pacientes/${result.patientId}/consentimento`}
            />
          }
          variant="outline"
        >
          Ver recibos deste paciente
        </Button>
      )}
      {message && <FieldError>{message}</FieldError>}
      <Card>
        <CardHeader>
          <CardTitle>Localizar cadastro existente</CardTitle>
          <CardDescription>
            {mode === 'new'
              ? 'Se a pessoa já está cadastrada, registre apenas um novo termo. Não crie duplicidade.'
              : 'Confirme o CPF do paciente correspondente a esta página antes de gravar.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <TextField
              id="existing-cpf"
              label="CPF do paciente"
              inputMode="numeric"
              value={existingCpf}
              onChange={(event) => {
                setExistingCpf(event.target.value)
                setExistingMatch(null)
                setExistingError('')
              }}
              error={existingError}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void lookupExisting()}
            disabled={!existingCpf.trim() || busy}
          >
            Localizar
          </Button>
          {existingMatch && (
            <div role="status" className="w-full text-sm">
              <strong>{existingMatch.fullName}</strong> · nascimento{' '}
              {new Date(existingMatch.birthDate).toLocaleDateString('pt-BR', {
                timeZone: 'UTC',
              })}
              {mode === 'new' && (
                <Button
                  render={
                    <Link
                      href={`/recepcao/pacientes/${existingMatch.patientId}/consentimento`}
                    />
                  }
                  variant="link"
                  className="ml-2"
                >
                  Registrar termo neste cadastro
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={(event) => void submit(event)} className="space-y-6">
        {mode === 'new' && (
          <Card>
            <CardHeader>
              <CardTitle>Dados do paciente</CardTitle>
              <CardDescription>
                Contato próprio é opcional no cadastro assistido. Adultos com
                e-mail recebem convite para definir senha; menores usam a conta
                do responsável.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="patient-name"
                label="Nome completo"
                value={patient.fullName}
                onChange={(event) =>
                  changePatient('fullName', event.target.value)
                }
                error={patientErrors.fullName}
              />
              <TextField
                id="patient-birth"
                label="Data de nascimento"
                type="date"
                value={patient.birthDate}
                onChange={(event) =>
                  changePatient('birthDate', event.target.value)
                }
                error={patientErrors.birthDate}
              />
              <TextField
                id="patient-cpf"
                label="CPF"
                inputMode="numeric"
                value={patient.cpf}
                onChange={(event) => changePatient('cpf', event.target.value)}
                error={patientErrors.cpf}
              />
              <TextField
                id="patient-phone"
                label="Celular (opcional)"
                type="tel"
                value={patient.phone}
                onChange={(event) => changePatient('phone', event.target.value)}
                error={patientErrors.phone}
              />
              <TextField
                id="patient-email"
                label="E-mail (opcional)"
                type="email"
                value={patient.email}
                onChange={(event) => changePatient('email', event.target.value)}
                error={patientErrors.email}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Responsável legal</CardTitle>
            <CardDescription>
              {minor
                ? 'Paciente menor: identifique o responsável e registre o parentesco.'
                : 'Preencha quando o consentimento for assinado por representante legal.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!minor && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={representing}
                  onChange={(event) => {
                    setRepresenting(event.target.checked)
                    setGuardian(null)
                  }}
                  className="size-5 accent-primary"
                />
                O consentimento será assinado por representante legal
              </label>
            )}
            {needGuardian && (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full max-w-sm">
                    <TextField
                      id="guardian-identifier"
                      label="CPF ou e-mail do responsável"
                      value={guardianIdentifier}
                      onChange={(event) => {
                        setGuardianIdentifier(event.target.value)
                        setGuardian(null)
                        setGuardianError('')
                      }}
                      error={guardianError}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!guardianIdentifier.trim() || busy}
                    onClick={() => void lookupGuardian()}
                  >
                    Localizar responsável
                  </Button>
                </div>
                {guardian && (
                  <p role="status" className="text-sm">
                    Responsável identificado:{' '}
                    <strong>{guardian.fullName}</strong>. Confira o documento e
                    o vínculo legal presencialmente.
                  </p>
                )}
                <TextField
                  id="guardian-relationship"
                  label="Parentesco ou vínculo legal"
                  value={relationship}
                  onChange={(event) => {
                    setRelationship(event.target.value)
                    setRelationshipError('')
                  }}
                  error={relationshipError}
                  placeholder="Ex.: mãe, pai, tutor"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Termo e assinatura</CardTitle>
            <CardDescription>
              Registre somente o termo vigente e confira a assinatura física
              antes do upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {term ? (
              <>
                <p className="text-sm font-semibold">Versão {term.version}</p>
                <label htmlFor="onsite-term" className="text-sm font-semibold">
                  Texto completo do termo
                </label>
                <Textarea
                  id="onsite-term"
                  value={term.body}
                  readOnly
                  className="min-h-48"
                />
              </>
            ) : (
              <ConsentTermState
                state={termError ?? 'loading'}
                admin={user.roles.includes('admin')}
                onRetry={() => void loadTerm()}
              />
            )}
            <TextField
              id="consenting-name"
              label="Nome de quem assinou"
              value={consentingPersonName}
              onChange={(event) => {
                setConsentingPersonName(event.target.value)
                setConsentingError('')
              }}
              error={consentingError}
            />
            <label className="flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={accepted}
                disabled={busy || !term}
                onChange={(event) => {
                  setAccepted(event.target.checked)
                  setAcceptedError('')
                }}
                className="mt-1 size-5 accent-primary"
              />
              Conferi presencialmente a assinatura da versão indicada.
            </label>
            {acceptedError && <FieldError>{acceptedError}</FieldError>}
            <div className="space-y-2">
              <label htmlFor="signed-term" className="text-sm font-semibold">
                Arquivo do termo assinado
              </label>
              <input
                id="signed-term"
                ref={fileInput}
                type="file"
                disabled={busy || !term}
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) =>
                  void pickFile(event.target.files?.[0] ?? null)
                }
                className="block w-full rounded-xl border border-input bg-background p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold"
                aria-invalid={Boolean(fileError)}
                aria-describedby={
                  fileError
                    ? 'signed-term-error signed-term-help'
                    : 'signed-term-help'
                }
              />
              <FieldHelp id="signed-term-help">
                Arquivo obrigatório: PDF, JPG ou PNG; limite configurado de{' '}
                {publicEnv.NEXT_PUBLIC_ATTACHMENT_MAX_MB} MB. Tipo e tamanho são
                conferidos novamente no servidor.
              </FieldHelp>
              {fileError && (
                <FieldError id="signed-term-error">{fileError}</FieldError>
              )}
              {file && (
                <p role="status" className="text-xs text-muted-foreground">
                  Selecionado: {file.name} · {file.type || 'tipo não informado'}{' '}
                  · {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="rounded-xl border border-border bg-card p-5 text-sm leading-6">
          <h2 className="font-semibold">Antes de confirmar</h2>
          <p className="text-muted-foreground">
            {mode === 'new' ? 'Paciente novo' : 'Paciente existente'} · versão{' '}
            {term?.version ?? 'indisponível'} ·{' '}
            {needGuardian
              ? `responsável ${guardian?.fullName ?? 'não identificado'}`
              : 'assinatura do próprio paciente'}{' '}
            · {file?.name ?? 'arquivo pendente'}
          </p>
        </div>
        {busy && (
          <div role="status" className="space-y-2 text-sm">
            <progress className="w-full" max={100} />
            Enviando e validando o termo assinado…
          </div>
        )}
        <Button type="submit" disabled={busy || !term || !file || !accepted}>
          {mode === 'new'
            ? 'Concluir cadastro presencial'
            : 'Registrar novo aceite'}
        </Button>
      </form>

      {mode === 'existing' && (
        <Card>
          <CardHeader>
            <CardTitle>Recibos de aceite presencial</CardTitle>
            <CardDescription>
              Metadados preservados após recarregar; o arquivo assinado fica em
              armazenamento protegido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {receiptError ? (
              <ErrorState
                title="Não foi possível carregar recibos"
                nextStep="Tente novamente."
                onRetry={() => void loadReceipts()}
              />
            ) : !receipts ? (
              <LoadingState />
            ) : receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum aceite presencial registrado.
              </p>
            ) : (
              <ul className="space-y-3">
                {receipts.map((item) => (
                  <li
                    key={item.consentEventId}
                    className="rounded-xl border border-border p-4 text-sm"
                  >
                    <strong>Versão {item.version}</strong>
                    <p className="mt-1 text-muted-foreground">
                      {item.consentingPersonName}
                      {item.consentingRelationship
                        ? ` · ${item.consentingRelationship}`
                        : ''}{' '}
                      · {date(item.occurredAt)}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Evidência vinculada: {item.signedFileId}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
