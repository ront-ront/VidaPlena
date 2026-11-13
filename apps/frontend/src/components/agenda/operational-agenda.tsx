'use client'
import { Dialog } from '@base-ui/react/dialog'
import { Temporal } from '@js-temporal/polyfill'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, SuccessNotice } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { ApiError } from '@/services/api-client'
import { appointmentStatus, type BookingReceipt } from '@/services/appointments'
import { catalogPages, schedulingAvailability } from '@/services/availability'
import {
  type AgendaFilters,
  type AgendaPage,
  type OperationalAppointment,
  operationalAgenda,
} from '@/services/operational-agenda'
import { professionalSchedule } from '@/services/schedule'
import {
  type ReceptionAction,
  ReceptionAppointment,
} from './reception-appointment'

const flagLabel = {
  contact_missing: 'Sem contato externo',
  email_unverified: 'E-mail não confirmado',
  consent_pending: 'Consentimento pendente',
  consent_revoked: 'Consentimento revogado',
}
const filtersSchema = z.object({
  localDate: z.iso.date(),
  patientQuery: z.string().trim().max(100).optional(),
  professionalId: z.uuid().optional(),
  specialtyId: z.uuid().optional(),
  status: z
    .enum([
      'confirmed',
      'waiting',
      'in_service',
      'completed',
      'no_show',
      'cancelled',
    ])
    .optional(),
})
function Flags({ row }: { row: OperationalAppointment }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {row.administrativeFlags.map((flag) => (
        <span
          key={flag}
          className="rounded-md bg-status-warning-background px-2 py-1 text-xs text-status-warning-foreground"
        >
          {flagLabel[flag]}
        </span>
      ))}
      {row.notificationAttention && (
        <span className="text-xs font-semibold">Avisos exigem atenção</span>
      )}
      {row.checkIn?.lateFlag && (
        <span className="text-xs font-semibold">Chegada com atraso</span>
      )}
      {row.bookingSource === 'fit_in' && (
        <span className="text-xs font-semibold">Encaixe</span>
      )}
      {(row.importOrigin || row.bookingSource === 'imported') && (
        <span className="text-xs font-semibold">Importado</span>
      )}
    </span>
  )
}
function AgendaSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando agenda"
      className="space-y-3 rounded-2xl border border-border bg-card p-5"
    >
      <span className="sr-only">Carregando atendimentos…</span>
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className="h-20 rounded-xl bg-muted motion-safe:animate-pulse"
        />
      ))}
    </div>
  )
}
export function OperationalAgenda({ operatorId }: { operatorId?: string }) {
  const [query, setQuery] = useState<AgendaFilters>({}),
    [draft, setDraft] = useState<AgendaFilters>({}),
    [data, setData] = useState<AgendaPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<ApiError | null>(null),
    [reload, setReload] = useState(0),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState<OperationalAppointment | null>(null),
    [operation, setOperation] = useState<{
      action: ReceptionAction
      original?: OperationalAppointment
    } | null>(null),
    [success, setSuccess] = useState(''),
    refreshButton = useRef<HTMLButtonElement>(null),
    focusAfter = useRef<string | null>(null),
    receivedAt = useRef(0),
    [validation, setValidation] = useState(''),
    [catalog, setCatalog] = useState<{
      specialties: { id: string; name: string }[]
      professionals: { id: string; displayName: string }[]
    }>({ specialties: [], professionals: [] }),
    [catalogError, setCatalogError] = useState(false),
    [catalogLoading, setCatalogLoading] = useState(true),
    [catalogReload, setCatalogReload] = useState(0),
    [announcement, setAnnouncement] = useState(''),
    generation = useRef(0),
    moreGate = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogReload solicita releitura explícita após falha.
  useEffect(() => {
    let active = true
    setCatalogLoading(true)
    setCatalogError(false)
    Promise.all([
      schedulingAvailability.specialties(),
      catalogPages((cursor) => professionalSchedule.professionals(cursor)),
    ])
      .then(([specialties, professionals]) => {
        if (active) setCatalog({ specialties, professionals })
      })
      .catch(() => {
        if (active) setCatalogError(true)
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })
    return () => {
      active = false
    }
  }, [catalogReload])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload renova a fotografia sem modificar filtros.
  useEffect(() => {
    const request = ++generation.current
    setLoading(true)
    setError(null)
    setData(null)
    operationalAgenda
      .day(query)
      .then((page) => {
        if (request === generation.current) {
          receivedAt.current = performance.now()
          setData(page)
          setDraft((current) => ({
            ...current,
            localDate: current.localDate ?? page.localDate,
          }))
          setAnnouncement(
            `Agenda de ${Temporal.PlainDate.from(page.localDate).toLocaleString('pt-BR')} atualizada. ${page.items.length} atendimentos carregados.`,
          )
        }
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
  }, [query, reload])
  useEffect(() => {
    if (!operation && !loading && data && focusAfter.current) {
      const target = document.querySelector<HTMLButtonElement>(
        `[data-appointment-id="${CSS.escape(focusAfter.current)}"]`,
      )
      ;(target ?? refreshButton.current)?.focus()
      focusAfter.current = null
    }
  }, [loading, data, operation])
  function refreshAfter(id?: string) {
    focusAfter.current = id ?? 'none'
    setLoading(true)
    setData(null)
    setQuery({ ...query, localDate: data?.localDate ?? query.localDate })
  }
  function changed(receipt: BookingReceipt) {
    setOperation(null)
    setSelected(null)
    setSuccess(
      `Estado do atendimento: ${appointmentStatus[receipt.appointment.status]}. ${receipt.notificationState === 'queued' ? 'Notificações na fila de envio.' : 'Confira o contato com o paciente.'}`,
    )
    refreshAfter(receipt.appointment.id)
  }
  async function loadMore() {
    if (!data?.nextCursor || moreGate.current) return
    moreGate.current = true
    setMore(true)
    setError(null)
    const request = generation.current,
      cursor = data.nextCursor
    try {
      const page = await operationalAgenda.day(
        { ...query, localDate: data.localDate },
        cursor,
      )
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
            }
          : page,
      )
      setAnnouncement('Mais atendimentos carregados na grade.')
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
  function apply() {
    const value = filtersSchema.safeParse({
      ...draft,
      localDate: draft.localDate ?? data?.localDate,
      patientQuery: draft.patientQuery?.trim() || undefined,
    })
    if (!value.success) {
      setValidation(
        'Confira a data e os filtros. A busca aceita até 100 caracteres.',
      )
      return
    }
    setValidation('')
    setSelected(null)
    setDraft(value.data)
    setQuery(value.data)
  }
  function moveDay(days: number) {
    if (!data) return
    const localDate = Temporal.PlainDate.from(data.localDate)
      .add({ days })
      .toString()
    setDraft({ ...query, localDate })
    setQuery({ ...query, localDate })
    setValidation('')
  }
  const time = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: data?.clinicTimeZone,
    }).format(new Date(value))
  const format = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: data?.clinicTimeZone,
    }).format(new Date(value))
  const specialties = [
    ...new Map(
      [
        ...catalog.specialties,
        ...(data?.items.map((row) => row.specialty) ?? []),
      ].map((item) => [item.id, item]),
    ).values(),
  ]
  const professionals = [
    ...new Map(
      [
        ...catalog.professionals,
        ...(data?.items.map((row) => ({
          id: row.professional.id,
          displayName: row.professional.name,
        })) ?? []),
      ].map((item) => [item.id, item]),
    ).values(),
  ]
  const columns = [
    ...new Map(
      (data?.items ?? []).map((row) => [
        `${row.specialty.id}:${row.professional.id}`,
        {
          key: `${row.specialty.id}:${row.professional.id}`,
          specialty: row.specialty,
          professional: row.professional,
        },
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      a.specialty.name.localeCompare(b.specialty.name, 'pt-BR') ||
      a.professional.name.localeCompare(b.professional.name, 'pt-BR'),
  )
  const times = [
    ...new Set(data?.items.map((row) => row.startsAt) ?? []),
  ].sort()
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Operação da clínica
          </p>
          <h1 className="font-heading text-3xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os atendimentos e as pendências administrativas do dia.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {operatorId && (
            <Button
              type="button"
              disabled={loading || more || !data}
              onClick={() => setOperation({ action: 'book' })}
            >
              Novo atendimento
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={loading || more || !data}
            onClick={() => moveDay(-1)}
          >
            Dia anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || more || !data}
            onClick={() => moveDay(1)}
          >
            Próximo dia
          </Button>
          <Button
            ref={refreshButton}
            type="button"
            variant="outline"
            disabled={loading || more}
            onClick={() =>
              setQuery({
                ...query,
                localDate: data?.localDate ?? query.localDate,
              })
            }
          >
            Atualizar agenda
          </Button>
        </div>
      </header>
      {success && (
        <SuccessNotice title="Operação registrada" description={success} />
      )}
      <form
        className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault()
          apply()
        }}
      >
        <TextField
          id="agenda-date"
          label="Data da agenda"
          type="date"
          value={draft.localDate ?? data?.localDate ?? ''}
          disabled={more}
          onChange={(e) => setDraft({ ...draft, localDate: e.target.value })}
        />
        <div className="sm:col-span-2 xl:col-span-2">
          <TextField
            id="agenda-patient"
            label="Buscar paciente por nome ou CPF"
            value={draft.patientQuery ?? ''}
            maxLength={100}
            disabled={more}
            onChange={(e) =>
              setDraft({ ...draft, patientQuery: e.target.value })
            }
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="agenda-specialty" className="text-sm font-semibold">
            Especialidade
          </label>
          <select
            id="agenda-specialty"
            className={selectClass}
            disabled={more || catalogLoading || catalogError}
            value={draft.specialtyId ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, specialtyId: e.target.value || undefined })
            }
          >
            <option value="">Todas as especialidades</option>
            {specialties.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <label
            htmlFor="agenda-professional"
            className="text-sm font-semibold"
          >
            Profissional
          </label>
          <select
            id="agenda-professional"
            className={selectClass}
            disabled={more || catalogLoading || catalogError}
            value={draft.professionalId ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                professionalId: e.target.value || undefined,
              })
            }
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <label htmlFor="agenda-status" className="text-sm font-semibold">
            Situação
          </label>
          <select
            id="agenda-status"
            className={selectClass}
            value={draft.status ?? ''}
            disabled={more}
            onChange={(e) =>
              setDraft({
                ...draft,
                status: (e.target.value ||
                  undefined) as AgendaFilters['status'],
              })
            }
          >
            <option value="">Todas as situações</option>
            {Object.entries(appointmentStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-4">
          <Button type="submit" disabled={more || loading}>
            Filtrar agenda
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={more || loading}
            onClick={() => {
              setDraft({})
              setQuery({})
              setValidation('')
            }}
          >
            Limpar filtros e ver hoje
          </Button>
        </div>
        {validation && (
          <p
            role="alert"
            className="text-sm text-destructive sm:col-span-2 xl:col-span-5"
          >
            {validation}
          </p>
        )}
      </form>
      {catalogError && (
        <ErrorState
          title="Não foi possível carregar os filtros de catálogo"
          nextStep="A leitura do dia continua disponível. Tente novamente para usar especialidades e profissionais."
          onRetry={() => setCatalogReload((n) => n + 1)}
        />
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            {Temporal.PlainDate.from(data.localDate).toLocaleString('pt-BR', {
              dateStyle: 'full',
            })}{' '}
            · Horários da clínica: {data.clinicTimeZone}
          </p>
          <dl
            className="grid gap-4 sm:grid-cols-3"
            aria-label="Resumo da agenda"
          >
            {[
              {
                label:
                  Temporal.Instant.from(data.serverNow)
                    .toZonedDateTimeISO(data.clinicTimeZone)
                    .toPlainDate()
                    .toString() === data.localDate
                    ? 'Consultas hoje'
                    : 'Consultas no dia',
                value: data.totals.all,
              },
              { label: 'Confirmadas', value: data.totals.confirmed },
              { label: 'No-show', value: data.totals.noShow },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1)"
              >
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="mt-2 text-3xl font-semibold tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-5 text-muted-foreground">
            Totais do dia no escopo dos filtros de paciente, especialidade e
            profissional; o filtro de situação e a paginação não reduzem estes
            totais.
          </p>
        </>
      )}
      {loading ? (
        <AgendaSkeleton />
      ) : (
        <>
          {error && (
            <ErrorState
              title="Não foi possível carregar a agenda"
              nextStep={error.message}
              onRetry={() => setReload((n) => n + 1)}
            />
          )}
          {data && !data.items.length && (
            <EmptyState
              title="Nenhum atendimento nesta seleção"
              description="Altere a data ou os filtros para conferir outros atendimentos."
            />
          )}
          {data && data.items.length > 0 && (
            <div className="min-w-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                {data.items.length} atendimentos carregados.
                {data.nextCursor
                  ? ' Há mais atendimentos; carregue a próxima página para completar a grade.'
                  : ' Grade completa para os filtros aplicados.'}{' '}
                Células vazias não indicam disponibilidade para agendamento.
              </p>
              <section
                aria-label="Grade diária de atendimentos"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável precisa foco para navegação por teclado.
                tabIndex={0}
                className="max-h-[70dvh] max-w-full overflow-auto rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Atendimentos registrados por hora, especialidade e
                    profissional
                  </caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 top-0 z-20 min-w-20 border-b border-r border-border bg-muted px-3 py-4"
                      >
                        Hora
                      </th>
                      {columns.map((col) => (
                        <th
                          scope="col"
                          key={col.key}
                          className="sticky top-0 z-10 min-w-56 border-b border-border bg-muted px-3 py-4"
                        >
                          <span className="block font-semibold">
                            {col.specialty.name}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {col.professional.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {times.map((startsAt) => (
                      <tr key={startsAt}>
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-4 align-top font-semibold tabular-nums"
                        >
                          {time(startsAt)}
                        </th>
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className="border-b border-border p-2 align-top"
                          >
                            <div className="space-y-2">
                              {data.items
                                .filter(
                                  (row) =>
                                    row.startsAt === startsAt &&
                                    row.specialty.id === col.specialty.id &&
                                    row.professional.id === col.professional.id,
                                )
                                .map((row) => (
                                  <button
                                    key={row.id}
                                    data-appointment-id={row.id}
                                    type="button"
                                    aria-label={`Ver atendimento de ${row.patient.name} às ${time(row.startsAt)}`}
                                    onClick={() => setSelected(row)}
                                    className="w-full space-y-2 rounded-xl border border-border bg-secondary/30 p-3 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <span className="block font-semibold">
                                      {row.patient.name}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                      {time(row.startsAt)}–{time(row.endsAt)} ·{' '}
                                      {row.modality === 'onsite'
                                        ? (row.room?.name ?? 'Presencial')
                                        : 'Online'}
                                    </span>
                                    <StatusBadge
                                      tone={
                                        row.status === 'confirmed'
                                          ? 'success'
                                          : row.status === 'no_show'
                                            ? 'warning'
                                            : 'neutral'
                                      }
                                      label={appointmentStatus[row.status]}
                                    />
                                    <Flags row={row} />
                                    {row.lastChange && (
                                      <span className="block text-xs">
                                        {row.lastChange.action === 'cancelled'
                                          ? 'Cancelamento'
                                          : 'Remarcação'}{' '}
                                        {row.lastChange.origin === 'clinic'
                                          ? 'pela clínica'
                                          : row.lastChange.origin ===
                                              'reception'
                                            ? 'pela recepção'
                                            : row.lastChange.origin ===
                                                'patient'
                                              ? 'pelo paciente'
                                              : 'registrado'}
                                      </span>
                                    )}
                                    {row.attendanceResponse?.response ===
                                      'cannot_attend' && (
                                      <span className="block text-xs font-semibold">
                                        Informou que não pode comparecer
                                      </span>
                                    )}
                                  </button>
                                ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}
          {data?.nextCursor && (
            <Button
              type="button"
              variant="outline"
              disabled={more}
              onClick={loadMore}
            >
              {more ? 'Carregando…' : 'Carregar mais atendimentos'}
            </Button>
          )}
        </>
      )}
      {selected && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/35" />
            <Dialog.Popup className="fixed inset-x-3 top-1/2 z-50 mx-auto max-h-[90dvh] max-w-2xl -translate-y-1/2 space-y-5 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-(--shadow-3) focus:outline-none">
              <Dialog.Title className="font-heading text-xl font-semibold">
                Detalhes do atendimento
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Informações administrativas do atendimento selecionado.
              </Dialog.Description>
              <div className="space-y-3 text-sm">
                <p className="font-semibold">{selected.patient.name}</p>
                <p>
                  {selected.specialty.name} · {selected.professional.name}
                </p>
                <p>
                  {format(selected.startsAt)} até {time(selected.endsAt)}
                </p>
                <StatusBadge
                  tone="info"
                  label={appointmentStatus[selected.status]}
                />
                <p>
                  {selected.modality === 'onsite'
                    ? `Presencial · ${selected.room?.name ?? 'Confirme a sala'}`
                    : 'Online'}
                </p>
                {selected.patient.cpfMasked && (
                  <p>CPF: {selected.patient.cpfMasked}</p>
                )}
                {selected.patient.birthDate && (
                  <p>
                    Nascimento:{' '}
                    {Temporal.PlainDate.from(
                      selected.patient.birthDate,
                    ).toLocaleString('pt-BR')}
                  </p>
                )}
                <Flags row={selected} />
                {selected.lastChange && (
                  <p>
                    {selected.lastChange.action === 'cancelled'
                      ? 'Cancelamento'
                      : 'Remarcação'}{' '}
                    {selected.lastChange.origin === 'clinic'
                      ? 'pela clínica'
                      : selected.lastChange.origin === 'reception'
                        ? 'pela recepção'
                        : selected.lastChange.origin === 'patient'
                          ? 'pelo paciente'
                          : 'registrado'}{' '}
                    em {format(selected.lastChange.occurredAt)}.
                  </p>
                )}
                {selected.checkIn && (
                  <p>
                    Chegada registrada: {format(selected.checkIn.arrivedAt)}
                  </p>
                )}
                {selected.noShowEligible && (
                  <p>
                    Conferência de ausência disponível para a recepção. Não há
                    marcação automática de falta.
                  </p>
                )}
                {selected.importOrigin && (
                  <p>
                    Origem: {selected.importOrigin.sourceSystem} · Importado em{' '}
                    {format(selected.importOrigin.importedAt)}
                  </p>
                )}
                <p className="break-all text-xs text-muted-foreground">
                  Número: {selected.id}
                </p>
              </div>
              {operatorId &&
                ['confirmed', 'waiting'].includes(selected.status) && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        setOperation({
                          action: 'reschedule',
                          original: selected,
                        })
                        setSelected(null)
                      }}
                    >
                      Reagendar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOperation({ action: 'cancel', original: selected })
                        setSelected(null)
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected(null)}
              >
                Fechar detalhes
              </Button>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {operation && operatorId && data && (
        <ReceptionAppointment
          action={operation.action}
          original={operation.original}
          actorId={operatorId}
          localDate={data.localDate}
          timeZone={data.clinicTimeZone}
          serverNow={new Date(
            Date.parse(data.serverNow) +
              Math.max(0, performance.now() - receivedAt.current),
          ).toISOString()}
          onDone={changed}
          onClose={(refresh) => {
            const id = operation.original?.id
            setOperation(null)
            if (refresh) refreshAfter(id)
            else focusAfter.current = id ?? 'none'
          }}
        />
      )}
    </div>
  )
}
