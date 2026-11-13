'use client'

import { Temporal } from '@js-temporal/polyfill'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'
import { FieldError, Label, TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { ApiError } from '@/services/api-client'
import {
  type AvailabilityResult,
  type AvailabilitySearch,
  type BookingSelection,
  type PublicProfessional,
  type PublicSpecialty,
  schedulingAvailability,
} from '@/services/availability'
import type { Modality } from '@/services/catalog'

const searchSchema = z
  .object({
    specialtyId: z.uuid(),
    professionalId: z.uuid().optional(),
    modality: z.enum(['onsite', 'remote']),
    visitType: z.enum(['first', 'return']),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((v) => v.from <= v.to, {
    path: ['to'],
    message: 'A data final deve ser igual ou posterior ao início.',
  })
export function AppointmentSearch({
  selection,
  onSelect,
  initialSearch,
  fixedAppointment = false,
}: {
  selection: BookingSelection | null
  initialSearch?: Partial<AvailabilitySearch>
  fixedAppointment?: boolean
  onSelect: (value: BookingSelection | null) => void
}) {
  const [specialties, setSpecialties] = useState<PublicSpecialty[]>([]),
    [specialtiesLoading, setSpecialtiesLoading] = useState(true),
    [catalogError, setCatalogError] = useState(false),
    [catalogReload, setCatalogReload] = useState(0)
  const [specialtyId, setSpecialtyId] = useState(
      initialSearch?.specialtyId ?? '',
    ),
    [professionalId, setProfessionalId] = useState(
      initialSearch?.professionalId ?? '',
    ),
    [modality, setModality] = useState<Modality>(
      initialSearch?.modality ?? 'onsite',
    ),
    [visitType, setVisitType] = useState<'first' | 'return'>(
      initialSearch?.visitType ?? 'first',
    ),
    [from, setFrom] = useState(initialSearch?.from ?? ''),
    [to, setTo] = useState(initialSearch?.to ?? '')
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]),
    [professionalsLoading, setProfessionalsLoading] = useState(false),
    [professionalsError, setProfessionalsError] = useState(false),
    [professionalReload, setProfessionalReload] = useState(0)
  const [result, setResult] = useState<AvailabilityResult | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [expired, setExpired] = useState(false)
  const selectedRef = useRef(selection)
  useEffect(() => {
    selectedRef.current = selection
  }, [selection])
  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogReload repete a paginação após falha transitória.
  useEffect(() => {
    let active = true
    setSpecialtiesLoading(true)
    setCatalogError(false)
    void schedulingAvailability
      .specialties()
      .then((items) => {
        if (active) setSpecialties(items)
      })
      .catch(() => {
        if (active) setCatalogError(true)
      })
      .finally(() => {
        if (active) setSpecialtiesLoading(false)
      })
    return () => {
      active = false
    }
  }, [catalogReload])
  // biome-ignore lint/correctness/useExhaustiveDependencies: professionalReload repete a busca de opções preservando filtros.
  useEffect(() => {
    if (!specialtyId) {
      setProfessionalsLoading(false)
      setProfessionalsError(false)
      setProfessionals([])
      return
    }
    let active = true
    setProfessionalsLoading(true)
    setProfessionalsError(false)
    setProfessionals([])
    void schedulingAvailability
      .professionals(specialtyId, modality)
      .then((items) => {
        if (active) setProfessionals(items)
      })
      .catch(() => {
        if (active) setProfessionalsError(true)
      })
      .finally(() => {
        if (active) setProfessionalsLoading(false)
      })
    return () => {
      active = false
    }
  }, [specialtyId, modality, professionalReload])
  function choose(value: BookingSelection | null) {
    selectedRef.current = value
    if (value) setExpired(false)
    onSelect(value)
  }
  function resetChoice() {
    choose(null)
    setExpired(false)
    setResult(null)
    setError('')
  }
  const specialty = specialties.find((s) => s.id === specialtyId)
  const parsed = searchSchema.safeParse({
    specialtyId,
    professionalId: professionalId || undefined,
    modality,
    visitType,
    from,
    to: to || from,
  })
  const dateError =
    from && to && from > to
      ? 'A data final deve ser igual ou posterior ao início.'
      : ''
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload atualiza a fotografia; catálogos não mudam os critérios desta consulta.
  useEffect(() => {
    const query = searchSchema.safeParse({
      specialtyId,
      professionalId: professionalId || undefined,
      modality,
      visitType,
      from,
      to: to || from,
    })
    if (!specialtyId || !from || !query.success) {
      setLoading(false)
      setResult(null)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    void schedulingAvailability
      .search(query.data)
      .then((data) => {
        if (!active) return
        const old = selectedRef.current
        if (
          old &&
          !data.days.some((day) =>
            day.slots.some(
              (s) =>
                s.professionalId === old.slot.professionalId &&
                s.startsAt === old.slot.startsAt &&
                s.endsAt === old.slot.endsAt &&
                (old.modality === 'remote' || s.roomAvailable),
            ),
          )
        ) {
          selectedRef.current = null
          onSelect(null)
          setExpired(true)
        }
        setResult(data)
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Não foi possível buscar horários. Tente novamente.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [
    specialtyId,
    professionalId,
    modality,
    visitType,
    from,
    to,
    onSelect,
    reload,
  ])
  const time = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: result?.clinicTimeZone,
    }).format(new Date(value))
  return (
    <div className="min-w-0 space-y-6">
      <section
        aria-labelledby="search-criteria"
        className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-6"
      >
        <div>
          <h2
            id="search-criteria"
            className="font-heading text-xl font-semibold"
          >
            Encontre um horário
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Escolha a especialidade e a data. Os horários são atualizados
            conforme seus filtros.
          </p>
        </div>
        {catalogError ? (
          <ErrorState
            title="Não foi possível carregar especialidades"
            nextStep="Confira sua conexão e tente novamente."
            onRetry={() => setCatalogReload((x) => x + 1)}
          />
        ) : specialtiesLoading ? (
          <LoadingState label="Carregando especialidades…" />
        ) : !specialties.length ? (
          <EmptyState
            title="Nenhuma especialidade disponível"
            description="Fale com a recepção para verificar a oferta de atendimento."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="booking-specialty">Especialidade</Label>
              <select
                id="booking-specialty"
                disabled={fixedAppointment}
                className={selectClass}
                value={specialtyId}
                onChange={(e) => {
                  const s = specialties.find(
                    (item) => item.id === e.target.value,
                  )
                  setSpecialtyId(e.target.value)
                  setProfessionalId('')
                  setModality(
                    s?.modalities.includes('onsite')
                      ? 'onsite'
                      : (s?.modalities[0] ?? 'onsite'),
                  )
                  resetChoice()
                }}
              >
                <option value="">Selecione a especialidade</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              id="booking-date-from"
              type="date"
              label="Data do atendimento"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetChoice()
              }}
            />
            <div className="grid gap-2">
              <Label htmlFor="booking-modality">Modalidade</Label>
              <select
                id="booking-modality"
                className={selectClass}
                value={modality}
                disabled={!specialty}
                onChange={(e) => {
                  setModality(e.target.value as Modality)
                  setProfessionalId('')
                  resetChoice()
                }}
              >
                {(specialty?.modalities ?? ['onsite']).map((m) => (
                  <option key={m} value={m}>
                    {m === 'onsite' ? 'Presencial' : 'Online'}
                  </option>
                ))}
              </select>
              {specialty && !specialty.modalities.includes('remote') && (
                <p className="text-xs text-muted-foreground">
                  Esta especialidade atende somente presencialmente.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="booking-visit">Tipo de atendimento</Label>
              <select
                id="booking-visit"
                disabled={fixedAppointment}
                className={selectClass}
                value={visitType}
                onChange={(e) => {
                  setVisitType(e.target.value as typeof visitType)
                  resetChoice()
                }}
              >
                <option value="first">Primeira consulta</option>
                <option value="return">Retorno</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="booking-professional">
                Profissional (opcional)
              </Label>
              <select
                id="booking-professional"
                className={selectClass}
                value={professionalId}
                disabled={
                  !specialty || professionalsLoading || professionalsError
                }
                onChange={(e) => {
                  setProfessionalId(e.target.value)
                  resetChoice()
                }}
              >
                <option value="">
                  Todos os profissionais da especialidade
                </option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              {professionalsLoading && (
                <p role="status" className="text-xs text-muted-foreground">
                  Carregando profissionais…
                </p>
              )}
            </div>
            <TextField
              id="booking-date-to"
              type="date"
              label="Pesquisar até (opcional)"
              help="Deixe vazio para consultar somente a data escolhida."
              value={to}
              min={from || undefined}
              error={dateError}
              onChange={(e) => {
                setTo(e.target.value)
                resetChoice()
              }}
            />
          </div>
        )}
        {professionalsError && (
          <ErrorState
            title="Não foi possível carregar os profissionais"
            nextStep="Tente novamente para identificar os profissionais disponíveis."
            onRetry={() => setProfessionalReload((x) => x + 1)}
          />
        )}
      </section>
      <section aria-labelledby="available-times" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="available-times"
              className="font-heading text-xl font-semibold"
            >
              Horários disponíveis
            </h2>
            {result && (
              <p className="mt-1 text-sm text-muted-foreground">
                Horários da clínica: {result.clinicTimeZone}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={loading || !parsed.success}
            onClick={() => setReload((x) => x + 1)}
          >
            Atualizar horários
          </Button>
        </div>
        {expired && (
          <FieldError>
            O horário selecionado deixou de estar disponível. Escolha outro
            horário.
          </FieldError>
        )}
        {loading ? (
          <LoadingState label="Buscando horários disponíveis…" />
        ) : error ? (
          <ErrorState
            title="Não foi possível buscar horários"
            nextStep={error}
            onRetry={() => setReload((x) => x + 1)}
          />
        ) : !parsed.success ? (
          <EmptyState
            title="Escolha especialidade e data"
            description="Depois, selecione o melhor horário para seu atendimento."
          />
        ) : result && !result.days.some((day) => day.slots.length) ? (
          <EmptyState
            title="Nenhum horário neste período"
            description={
              result.nearestAvailableAt
                ? `Próxima data disponível: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: result.clinicTimeZone }).format(new Date(result.nearestAvailableAt))}.`
                : 'Tente outras datas ou fale com a recepção.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-3">
                {result.nearestAvailableAt ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const date = Temporal.Instant.from(
                        result.nearestAvailableAt as string,
                      )
                        .toZonedDateTimeISO(result.clinicTimeZone)
                        .toPlainDate()
                        .toString()
                      setFrom(date)
                      setTo(date)
                      resetChoice()
                    }}
                  >
                    Ver próxima data
                  </Button>
                ) : null}
                <Link href="/agenda/espera" className={buttonVariants()}>
                  Entrar na lista de espera
                </Link>
              </div>
            }
          />
        ) : (
          result?.days.map((day) => (
            <section
              key={day.localDate}
              aria-label={`Horários de ${day.localDate}`}
              className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-6"
            >
              <h3 className="font-heading text-lg font-semibold capitalize">
                {Temporal.PlainDate.from(day.localDate).toLocaleString(
                  'pt-BR',
                  { dateStyle: 'full' },
                )}
              </h3>
              {[...new Set(day.slots.map((s) => s.professionalId))].map(
                (id) => {
                  const professional = professionals.find((p) => p.id === id)
                  return (
                    <div key={id} className="space-y-3">
                      <h4 className="text-sm font-semibold">
                        {professional?.displayName ??
                          (professionalsLoading
                            ? 'Carregando profissional…'
                            : 'Profissional indisponível')}
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        {day.slots
                          .filter((s) => s.professionalId === id)
                          .map((slot) => {
                            const available =
                              !!professional &&
                              (modality === 'remote' || slot.roomAvailable)
                            return (
                              <Button
                                key={`${slot.startsAt}:${slot.endsAt}`}
                                type="button"
                                variant={
                                  selection?.slot.professionalId === id &&
                                  selection.slot.startsAt === slot.startsAt
                                    ? 'secondary'
                                    : 'outline'
                                }
                                className="h-auto min-h-12 whitespace-normal px-4 py-3 text-left"
                                disabled={!available || professionalsLoading}
                                aria-label={`${time(slot.startsAt)} até ${time(slot.endsAt)}, ${professional?.displayName ?? 'profissional indisponível'}, ${modality === 'onsite' ? 'presencial' : 'online'}`}
                                onClick={() => {
                                  if (professional && specialty)
                                    choose({
                                      specialty,
                                      professional,
                                      slot,
                                      modality,
                                      visitType,
                                      clinicTimeZone: result.clinicTimeZone,
                                    })
                                }}
                              >
                                <span className="block">
                                  {time(slot.startsAt)}–{time(slot.endsAt)}
                                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                    {available
                                      ? modality === 'onsite'
                                        ? 'Presencial'
                                        : 'Online'
                                      : 'Indisponível'}
                                  </span>
                                </span>
                              </Button>
                            )
                          })}
                      </div>
                    </div>
                  )
                },
              )}
            </section>
          ))
        )}
      </section>
    </div>
  )
}
