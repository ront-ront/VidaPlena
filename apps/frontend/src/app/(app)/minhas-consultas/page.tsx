'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AppointmentChange } from '@/components/appointments/appointment-change'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { selectClass } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { ApiError } from '@/services/api-client'
import {
  appointmentStatus,
  appointments,
  type BookingReceipt,
  type OwnAppointment,
  type OwnAppointmentPage,
} from '@/services/appointments'
import { myAccount } from '@/services/my-account'

type Subject = { patientId: string; fullName: string }
type Snapshot = OwnAppointmentPage & { receivedAt: number }
export default function MyAppointmentsPage() {
  const { user } = useAuth()
  const [view, setView] = useState<'upcoming' | 'history'>('upcoming'),
    [patientId, setPatientId] = useState(''),
    [subjects, setSubjects] = useState<Subject[]>([]),
    [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<ApiError | null>(null),
    [more, setMore] = useState(false),
    [reload, setReload] = useState(0),
    [notice, setNotice] = useState(''),
    [clock, setClock] = useState(0),
    [change, setChange] = useState<{
      row: OwnAppointment
      action: 'cancel' | 'reschedule'
    } | null>(null),
    generation = useRef(0),
    moreGate = useRef(false)
  const allowed = user?.roles.includes('patient') ?? false
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload é a atualização explícita da fotografia do servidor.
  useEffect(() => {
    if (!allowed || !user) return
    const request = ++generation.current
    setLoading(true)
    setError(null)
    setData(null)
    Promise.all([
      appointments.own({ view, patientId: patientId || undefined }),
      myAccount.dependents(),
    ])
      .then(([page, { items }]) => {
        if (request !== generation.current) return
        const values = new Map<string, Subject>()
        if (user.patientId)
          values.set(user.patientId, {
            patientId: user.patientId,
            fullName: user.profile.fullName,
          })
        for (const dep of items)
          if (dep.status === 'active') values.set(dep.patientId, dep)
        setSubjects([...values.values()])
        setData({ ...page, receivedAt: performance.now() })
        setClock(performance.now())
      })
      .catch((cause) => {
        if (request === generation.current)
          setError(
            cause instanceof ApiError
              ? cause
              : new ApiError(0, 'SERVICE_UNAVAILABLE'),
          )
      })
      .finally(() => {
        if (request === generation.current) setLoading(false)
      })
    return () => {
      generation.current++
    }
  }, [allowed, user, view, patientId, reload])
  const serverTime = data
    ? Date.parse(data.serverNow) + Math.max(0, clock - data.receivedAt)
    : 0
  useEffect(() => {
    if (!data) return
    const deadlines = data.items
      .filter(
        (row) =>
          row.selfService.cancelAllowed || row.selfService.rescheduleAllowed,
      )
      .map((row) => Date.parse(row.selfService.deadline))
      .filter((value) => value >= serverTime)
    if (!deadlines.length) return
    const delay = Math.min(
      Math.max(1, Math.min(...deadlines) - serverTime + 1),
      2_147_483_647,
    )
    const timer = setTimeout(() => setClock(performance.now()), delay)
    return () => clearTimeout(timer)
  }, [data, serverTime])
  async function loadMore() {
    if (!data?.nextCursor || moreGate.current) return
    moreGate.current = true
    setMore(true)
    setError(null)
    const request = generation.current,
      cursor = data.nextCursor
    try {
      const page = await appointments.own({
        view,
        patientId: patientId || undefined,
        cursor,
      })
      if (request !== generation.current) return
      if (page.nextCursor === cursor)
        throw new ApiError(502, 'SERVICE_UNAVAILABLE')
      setData((current) =>
        current
          ? {
              ...page,
              items: [
                ...new Map(
                  [...current.items, ...page.items].map((row) => [row.id, row]),
                ).values(),
              ],
              receivedAt: performance.now(),
            }
          : null,
      )
      setClock(performance.now())
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, 'SERVICE_UNAVAILABLE'),
        )
    } finally {
      moreGate.current = false
      setMore(false)
    }
  }
  function changed(result: BookingReceipt) {
    setChange(null)
    setNotice(
      `Estado da consulta atualizado: ${appointmentStatus[result.appointment.status]}. ${result.notificationState === 'queued' ? 'Notificações na fila de envio.' : 'Confira seus contatos com a recepção.'}`,
    )
    if (result.appointment.status === 'cancelled') setView('history')
    setReload((value) => value + 1)
  }
  if (!user) return <LoadingState />
  if (!allowed) return <ForbiddenState />
  const format = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: data?.clinicTimeZone,
    }).format(new Date(value))
  const expired = (row: OwnAppointment) =>
    !data ||
    Date.parse(row.selfService.deadline) <
      Date.parse(data.serverNow) +
        Math.max(0, performance.now() - data.receivedAt)
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Seu cuidado, organizado
          </p>
          <h1 className="font-heading text-3xl font-semibold">
            Minhas consultas
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Acompanhe seus atendimentos e os de seus dependentes. Consulte o
            prazo disponível antes de alterar.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/agendar" />}>
          Agendar atendimento
        </Button>
      </header>
      {notice && (
        <SuccessNotice title="Consulta atualizada" description={notice} />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-card p-4">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Período das consultas</legend>
          {(['upcoming', 'history'] as const).map((item) => (
            <Button
              key={item}
              type="button"
              variant={view === item ? 'secondary' : 'outline'}
              aria-pressed={view === item}
              disabled={more}
              onClick={() => {
                setView(item)
                setChange(null)
              }}
            >
              {item === 'upcoming' ? 'Futuras' : 'Histórico'}
            </Button>
          ))}
        </fieldset>
        <div className="grid min-w-0 gap-2">
          <label
            htmlFor="appointments-subject"
            className="text-sm font-semibold"
          >
            Paciente
          </label>
          <select
            id="appointments-subject"
            className={selectClass}
            value={patientId}
            disabled={more}
            onChange={(event) => {
              setPatientId(event.target.value)
              setChange(null)
            }}
          >
            <option value="">Todos da minha conta</option>
            {subjects.map((subject) => (
              <option key={subject.patientId} value={subject.patientId}>
                {subject.fullName}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading || more}
          onClick={() => setReload((value) => value + 1)}
        >
          Atualizar consultas
        </Button>
      </div>
      {data && (
        <p className="text-xs text-muted-foreground">
          Horários da clínica: {data.clinicTimeZone}
        </p>
      )}
      {loading ? (
        <LoadingState label="Carregando suas consultas…" />
      ) : (
        <>
          {error && (
            <ErrorState
              title="Não foi possível atualizar as consultas"
              nextStep={error.message}
              onRetry={() => setReload((value) => value + 1)}
            />
          )}
          {data && !data.items.length && (
            <EmptyState
              title={
                view === 'upcoming'
                  ? 'Nenhuma consulta futura'
                  : 'Nenhum atendimento no histórico'
              }
              description="Atendimentos cancelados permanecem no histórico. Para agendar, consulte os horários disponíveis."
            />
          )}
          <div className="grid min-w-0 gap-4">
            {data?.items.map((row) => {
              const within = Date.parse(row.selfService.deadline) >= serverTime,
                canReschedule = row.selfService.rescheduleAllowed && within,
                canCancel = row.selfService.cancelAllowed && within
              const origin = {
                patient: 'pelo paciente ou responsável',
                reception: 'pela recepção',
                clinic: 'pela clínica',
              }
              return (
                <article
                  key={row.id}
                  aria-label={`${row.specialtyName ?? 'Atendimento'} em ${format(row.startsAt)}`}
                  className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1)"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="font-heading text-xl font-semibold">
                        {row.specialtyName ?? 'Especialidade do atendimento'}
                      </h2>
                      <p className="text-sm font-semibold">
                        {format(row.startsAt)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {row.professionalName ?? 'Profissional do atendimento'}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        row.status === 'cancelled' || row.status === 'no_show'
                          ? 'neutral'
                          : row.status === 'confirmed'
                            ? 'success'
                            : 'info'
                      }
                      label={appointmentStatus[row.status]}
                    />
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Paciente</dt>
                      <dd>
                        {subjects.find(
                          (subject) => subject.patientId === row.patientId,
                        )?.fullName ?? 'Paciente vinculado à sua conta'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Atendimento</dt>
                      <dd>
                        {row.modality === 'onsite' ? 'Presencial' : 'Online'} ·{' '}
                        {row.visitType === 'first'
                          ? 'Primeira consulta'
                          : 'Retorno'}
                      </dd>
                    </div>
                    {row.modality === 'onsite' && (
                      <div>
                        <dt className="text-muted-foreground">Sala</dt>
                        <dd>{row.roomName ?? 'Confirme na recepção'}</dd>
                      </div>
                    )}
                  </dl>
                  <details className="text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Detalhes do atendimento
                    </summary>
                    <div className="space-y-2 pb-3">
                      <p className="break-all">Número: {row.id}</p>
                      {row.lastChange ? (
                        <p>
                          {row.lastChange.action === 'rescheduled'
                            ? 'Remarcação'
                            : 'Cancelamento'}{' '}
                          {row.lastChange.origin
                            ? origin[row.lastChange.origin]
                            : 'registrado'}{' '}
                          em {format(row.lastChange.occurredAt)}.
                        </p>
                      ) : (
                        <p>Nenhuma remarcação ou cancelamento registrado.</p>
                      )}
                      {row.modality === 'remote' && (
                        <p>
                          Preparo e acesso à videochamada serão disponibilizados
                          em uma próxima etapa.
                        </p>
                      )}
                    </div>
                  </details>
                  {view === 'upcoming' && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {canReschedule || canCancel
                          ? `Alteração online até ${format(row.selfService.deadline)}.`
                          : 'Para alterar este atendimento, procure a recepção da clínica.'}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {canReschedule && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (!expired(row))
                                setChange({ row, action: 'reschedule' })
                              else setClock(performance.now())
                            }}
                          >
                            Reagendar
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (!expired(row))
                                setChange({ row, action: 'cancel' })
                              else setClock(performance.now())
                            }}
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </div>
          {data?.nextCursor && (
            <Button
              type="button"
              variant="outline"
              disabled={more}
              onClick={loadMore}
            >
              {more ? 'Carregando…' : 'Carregar mais consultas'}
            </Button>
          )}
        </>
      )}
      {change && data && (
        <AppointmentChange
          row={change.row}
          action={change.action}
          actorId={user.id}
          timeZone={data.clinicTimeZone}
          deadlinePassed={() => expired(change.row)}
          onClose={() => setChange(null)}
          onDone={changed}
        />
      )}
    </div>
  )
}
