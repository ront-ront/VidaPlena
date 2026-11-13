'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
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
import { WaitlistEntryCard } from '@/components/waitlist/entry-card'
import { WaitlistEntryForm } from '@/components/waitlist/entry-form'
import { FitInForm } from '@/components/waitlist/fit-in-form'
import type { WaitingSubject } from '@/components/waitlist/subject-picker'
import { ApiError } from '@/services/api-client'
import { appointmentStatus, type BookingReceipt } from '@/services/appointments'
import {
  type PublicSpecialty,
  schedulingAvailability,
} from '@/services/availability'
import { myAccount } from '@/services/my-account'
import {
  type SchedulingContext,
  type WaitlistPage,
  waitlist,
} from '@/services/waitlist'
export default function WaitingPage() {
  const { user } = useAuth(),
    portal = user?.roles.includes('patient') ?? false,
    canQueue = !!user?.roles.some((r) =>
      ['patient', 'receptionist', 'admin'].includes(r),
    ),
    canFit = !!user?.roles.some((r) => ['receptionist', 'manager'].includes(r)),
    allowed = canQueue || canFit
  const [context, setContext] = useState<SchedulingContext | null>(null),
    [specialties, setSpecialties] = useState<PublicSpecialty[]>([]),
    [subjects, setSubjects] = useState<WaitingSubject[]>([]),
    [baseError, setBaseError] = useState(false),
    [baseReload, setBaseReload] = useState(0),
    [page, setPage] = useState<WaitlistPage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [reload, setReload] = useState(0),
    [specialtyId, setSpecialtyId] = useState(''),
    [status, setStatus] = useState(''),
    [more, setMore] = useState(false),
    [notice, setNotice] = useState(''),
    [receipt, setReceipt] = useState<BookingReceipt | null>(null),
    [now, setNow] = useState(0),
    heading = useRef<HTMLHeadingElement>(null),
    focusAfter = useRef(false),
    clock = useRef({ server: 0, anchor: 0 }),
    generation = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: baseReload refaz contexto e catálogos após falha.
  useEffect(() => {
    if (!allowed || !user) return
    let active = true
    setContext(null)
    setBaseError(false)
    Promise.all([
      waitlist.context(),
      schedulingAvailability.specialties(),
      portal ? myAccount.dependents() : Promise.resolve({ items: [] }),
    ])
      .then(([ctx, options, { items }]) => {
        if (!active) return
        setContext(ctx)
        setSpecialties(options)
        setSubjects([
          ...(user.patientId
            ? [{ patientId: user.patientId, fullName: user.profile.fullName }]
            : []),
          ...items.filter(
            (s) => s.status === 'active' && s.patientId !== user.patientId,
          ),
        ])
        clock.current = {
          server: Date.parse(ctx.serverNow),
          anchor: performance.now(),
        }
        setNow(Date.parse(ctx.serverNow))
      })
      .catch(() => {
        if (active) setBaseError(true)
      })
    return () => {
      active = false
    }
  }, [allowed, user, portal, baseReload])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload atualiza dados após ação sem mudar filtros.
  useEffect(() => {
    if (!context || !canQueue) return
    const request = ++generation.current
    setLoading(true)
    setError(null)
    setPage(null)
    waitlist
      .list({ specialtyId, status })
      .then((result) => {
        if (request === generation.current) setPage(result)
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
  }, [context, canQueue, specialtyId, status, reload])
  useEffect(() => {
    if (!context) return
    const tick = setInterval(
      () =>
        setNow(clock.current.server + performance.now() - clock.current.anchor),
      1000,
    )
    return () => clearInterval(tick)
  }, [context])
  async function loadMore() {
    if (more || !page?.nextCursor) return
    setMore(true)
    const current = generation.current,
      cursor = page.nextCursor
    try {
      const result = await waitlist.list({ specialtyId, status, cursor })
      if (current !== generation.current) return
      if (result.nextCursor === cursor)
        throw new ApiError(502, 'SERVICE_UNAVAILABLE')
      setPage((old) =>
        old
          ? {
              ...result,
              items: [
                ...new Map(
                  [...old.items, ...result.items].map((v) => [v.id, v]),
                ).values(),
              ],
            }
          : result,
      )
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'SERVICE_UNAVAILABLE'),
      )
    } finally {
      setMore(false)
    }
  }
  useEffect(() => {
    if (focusAfter.current && ((!canQueue && receipt) || (!loading && page))) {
      heading.current?.focus()
      focusAfter.current = false
    }
  }, [canQueue, loading, page, receipt])
  function changed() {
    focusAfter.current = true
    if (canQueue) {
      setLoading(true)
      setPage(null)
    }
    setNotice('Operação registrada pelo sistema.')
    setReload((v) => v + 1)
  }
  function confirmed(result: BookingReceipt) {
    setReceipt(result)
    changed()
  }
  if (!user) return <LoadingState />
  if (!allowed) return <ForbiddenState />
  if (baseError)
    return (
      <ErrorState
        title="Não foi possível preparar espera e encaixe"
        nextStep="Tente novamente para conferir o horário da clínica."
        onRetry={() => setBaseReload((v) => v + 1)}
      />
    )
  if (!context) return <LoadingState label="Preparando espera e encaixe…" />
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Oportunidades de atendimento
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-heading text-3xl font-semibold outline-none"
        >
          {portal ? 'Minha lista de espera' : 'Espera e encaixe'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Horários da clínica: {context.clinicTimeZone}. A posição é
          informativa; ofertas dependem de uma vaga compatível.
        </p>
      </header>
      {notice && (
        <SuccessNotice title="Operação concluída" description={notice} />
      )}
      {receipt && (
        <section
          className="space-y-3 rounded-xl border border-border bg-card p-4"
          aria-label="Atendimento registrado"
        >
          <p role="status" className="font-semibold">
            Atendimento: {appointmentStatus[receipt.appointment.status]}
          </p>
          {receipt.appointment.bookingSource === 'fit_in' && (
            <p className="font-semibold">Encaixe</p>
          )}
          <p className="break-all text-sm">Número: {receipt.appointment.id}</p>
          <p className="text-sm">
            {receipt.notificationState === 'queued'
              ? 'Notificações na fila de envio.'
              : 'Confira o contato com a recepção.'}
          </p>
          <Link
            href={portal ? '/minhas-consultas' : '/agenda'}
            className="font-semibold text-primary underline"
          >
            {portal ? 'Minhas consultas' : 'Ver agenda'}
          </Link>
        </section>
      )}
      {canQueue && (
        <>
          <WaitlistEntryForm
            context={context}
            specialties={specialties}
            subjects={portal ? subjects : undefined}
            onDone={changed}
          />
          <section className="space-y-4" aria-label="Inscrições na espera">
            <h2 className="font-heading text-xl font-semibold">
              {portal ? 'Minhas inscrições' : 'Fila por ordem de entrada'}
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <label htmlFor="queue-specialty">Filtrar especialidade</label>
                <select
                  id="queue-specialty"
                  className={selectClass}
                  value={specialtyId}
                  disabled={more}
                  onChange={(e) => setSpecialtyId(e.target.value)}
                >
                  <option value="">Todas</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="queue-status">Filtrar situação</label>
                <select
                  id="queue-status"
                  className={selectClass}
                  value={status}
                  disabled={more}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="waiting">Na espera</option>
                  <option value="offered">Com oferta</option>
                  <option value="fulfilled">Atendidas</option>
                  <option value="cancelled">Saídas</option>
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loading || more}
                onClick={() => setReload((v) => v + 1)}
              >
                Atualizar lista
              </Button>
            </div>
            {loading ? (
              <LoadingState label="Carregando inscrições…" />
            ) : (
              <>
                {error && (
                  <ErrorState
                    title="Não foi possível carregar a espera"
                    nextStep={error.message}
                    onRetry={() => setReload((v) => v + 1)}
                  />
                )}
                {page && !page.items.length && (
                  <EmptyState
                    title="Nenhuma inscrição nesta seleção"
                    description="Cadastre suas preferências ou altere os filtros."
                  />
                )}
                {page?.items.map((entry) => (
                  <WaitlistEntryCard
                    key={`${entry.id}:${entry.status}:${entry.offer?.id ?? 'none'}`}
                    entry={entry}
                    specialty={
                      specialties.find((s) => s.id === entry.specialtyId)
                        ?.name ?? 'Especialidade da inscrição'
                    }
                    name={
                      portal
                        ? (subjects.find((s) => s.patientId === entry.patientId)
                            ?.fullName ?? 'Paciente da sua conta')
                        : (entry.patientName ?? 'Paciente cadastrado')
                    }
                    timeZone={context.clinicTimeZone}
                    now={now}
                    actorId={user.id}
                    portal={portal}
                    onDone={changed}
                    onReceipt={confirmed}
                  />
                ))}
                {page?.nextCursor && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={more}
                    onClick={loadMore}
                  >
                    {more ? 'Carregando…' : 'Carregar mais inscrições'}
                  </Button>
                )}
              </>
            )}
          </section>
        </>
      )}
      {canFit && (
        <FitInForm
          context={context}
          specialties={specialties}
          actorId={user.id}
          reception={user.roles.includes('receptionist')}
          onDone={confirmed}
        />
      )}
    </div>
  )
}
