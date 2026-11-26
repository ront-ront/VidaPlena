'use client'
import { Temporal } from '@js-temporal/polyfill'
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { z } from 'zod'
import { useAuth } from '@/components/auth-provider'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { ApiError } from '@/services/api-client'
import {
  type ClinicalHeader,
  clinicalRecords,
} from '@/services/clinical-records'

export function clinicalDate(value: string, zone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: zone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}
type RecordContext = {
  header: ClinicalHeader
  clinicTimeZone: string
  serverNow: string
  reload: () => void
  fail: (error: unknown) => void
}
const RecordContext = createContext<RecordContext | null>(null)
export function useClinicalRecord() {
  const value = useContext(RecordContext)
  if (!value) throw new Error('Contexto clínico ausente')
  return value
}
const alertLabel = {
  allergy: 'Alergia',
  condition: 'Condição crítica',
  continuous_medication: 'Medicamento contínuo',
  other: 'Alerta',
}
function RecordSkeleton() {
  return (
    <div aria-busy="true" className="space-y-5">
      <p role="status" className="text-sm text-muted-foreground">
        Abrindo prontuário autorizado…
      </p>
      <div
        aria-hidden="true"
        className="space-y-5 animate-pulse motion-reduce:animate-none"
      >
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex gap-3">
            <div className="size-11 rounded-full bg-muted" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
          <div className="h-12 rounded-xl bg-muted" />
        </div>
        <div className="h-64 rounded-2xl border border-border bg-card p-5">
          <div className="h-5 w-1/3 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
export function ClinicalRecordShell({
  patientId,
  children,
}: {
  patientId: string
  children: ReactNode
}) {
  const { user } = useAuth(),
    allowed = !!user?.roles.includes('professional'),
    valid = z.uuid().safeParse(patientId).success
  const [epoch, setEpoch] = useState(0),
    [data, setData] = useState<{
      header: ClinicalHeader
      clinicTimeZone: string
      serverNow: string
      epoch: number
    } | null>(null),
    [error, setError] = useState<unknown>(null)
  useEffect(() => {
    if (!allowed || !valid) return
    const controller = new AbortController()
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined
    setData(null)
    setError(null)
    void Promise.all([
      clinicalRecords.header(patientId, controller.signal),
      clinicalRecords.context(controller.signal),
    ])
      .then(([header, context]) => {
        if (!active) return
        const remaining = Date.parse(header.linkBasis.expiresAt) - Date.now()
        if (remaining <= 0) {
          setError(new ApiError(404, 'NOT_FOUND_OR_FORBIDDEN'))
          return
        }
        setData({ header, ...context, epoch })
        timer = setTimeout(
          () => {
            if (active) {
              if (Date.now() < Date.parse(header.linkBasis.expiresAt))
                setEpoch((v) => v + 1)
              else {
                setData(null)
                setError(new ApiError(404, 'NOT_FOUND_OR_FORBIDDEN'))
              }
            }
          },
          Math.min(remaining, 2147483647),
        )
      })
      .catch((failure) => {
        if (active) {
          setData(null)
          setError(failure)
        }
      })
    return () => {
      active = false
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [allowed, valid, patientId, epoch])
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') setEpoch((v) => v + 1)
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])
  if (!user) return <LoadingState />
  if (!allowed) return <ForbiddenState />
  if (!valid)
    return (
      <ErrorState
        title="Prontuário indisponível"
        nextStep="Volte à agenda clínica e selecione um paciente."
      />
    )
  if (error)
    return (
      <div className="space-y-4">
        <ErrorState
          title={
            error instanceof ApiError &&
            (error.status === 403 || error.status === 404)
              ? 'Acesso ao prontuário indisponível'
              : 'Não foi possível abrir o prontuário'
          }
          nextStep="Confira seu vínculo com o paciente ou tente atualizar o acesso. Nenhum dado clínico está sendo exibido."
          onRetry={() => {
            setError(null)
            setEpoch((v) => v + 1)
          }}
        />
        <Link
          href="/clinico/agenda"
          className={buttonVariants({ variant: 'outline' })}
        >
          Voltar à agenda clínica
        </Link>
        <p className="text-sm text-muted-foreground">
          Em uma urgência clínica, o acesso excepcional exige justificativa e
          fica registrado em auditoria.{' '}
          <Link
            className="font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/prontuarios/acesso-urgente?patientId=${encodeURIComponent(patientId)}`}
          >
            Solicitar acesso de urgência
          </Link>
        </p>
      </div>
    )
  if (!data || data.epoch !== epoch) return <RecordSkeleton />
  const h = data.header,
    age = Temporal.Instant.from(data.serverNow)
      .toZonedDateTimeISO(data.clinicTimeZone)
      .toPlainDate()
      .since(Temporal.PlainDate.from(h.patient.birthDate), {
        largestUnit: 'years',
      }).years
  return (
    <RecordContext.Provider
      value={{
        ...data,
        reload: () => setEpoch((v) => v + 1),
        fail: (failure) => {
          setData(null)
          setError(failure)
        },
      }}
    >
      <div className="space-y-6">
        <Link
          href="/clinico/agenda"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Agenda clínica
        </Link>
        <section
          aria-label="Identificação do paciente"
          className="relative z-10 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) min-[761px]:sticky min-[761px]:top-3"
        >
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-blue-200 to-brand-mint-200 text-sm font-semibold text-brand-blue-900"
            >
              {h.patient.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0])
                .join('')}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-semibold">
                {h.patient.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {age} anos · Nascimento:{' '}
                {h.patient.birthDate.split('-').reverse().join('/')}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                Prontuário {h.recordNumber}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Última consulta:{' '}
                {h.lastEncounterAt
                  ? clinicalDate(h.lastEncounterAt, data.clinicTimeZone)
                  : 'Nenhum atendimento concluído'}
              </p>
            </div>
          </div>
          {h.alerts.length > 0 && (
            <ul
              aria-label="Alertas do paciente"
              className="grid gap-2 sm:grid-cols-2"
            >
              {h.alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2 rounded-xl bg-status-warning-background p-3 text-status-warning-foreground"
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <div className="min-w-0 text-sm">
                    <p className="break-words font-semibold">
                      {alertLabel[a.kind]}: {a.term}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {a.verificationState === 'reported'
                        ? 'Relatado · aguarda confirmação clínica'
                        : 'Confirmado pelo profissional'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-2 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {h.linkBasis.kind === 'emergency'
              ? 'Acesso de urgência auditado'
              : 'Vínculo assistencial'}{' '}
            · até {clinicalDate(h.linkBasis.expiresAt, data.clinicTimeZone)}
            {h.linkBasis.scope === 'pre'
              ? ' · leitura pré-consulta limitada'
              : ''}
          </p>
        </section>
        {children}
      </div>
    </RecordContext.Provider>
  )
}
