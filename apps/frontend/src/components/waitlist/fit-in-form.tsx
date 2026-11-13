'use client'
import { Temporal } from '@js-temporal/polyfill'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { commandNonce } from '@/lib/booking-command'
import { ApiError } from '@/services/api-client'
import type { BookingReceipt } from '@/services/appointments'
import {
  type PublicProfessional,
  type PublicSpecialty,
  schedulingAvailability,
} from '@/services/availability'
import { type RoomOptions, roomOptions } from '@/services/operational-agenda'
import { type SchedulingContext, waitlist } from '@/services/waitlist'
import { SubjectPicker, type WaitingSubject } from './subject-picker'
export function FitInForm({
  context,
  specialties,
  actorId,
  reception,
  onDone,
}: {
  context: SchedulingContext
  specialties: PublicSpecialty[]
  actorId: string
  reception: boolean
  onDone: (receipt: BookingReceipt) => void
}) {
  const [patient, setPatient] = useState<WaitingSubject | null>(null),
    [specialtyId, setSpecialtyId] = useState(''),
    [modality, setModality] = useState<'onsite' | 'remote'>('onsite'),
    [visitType, setVisitType] = useState<'first' | 'return'>('first'),
    [professionalId, setProfessionalId] = useState(''),
    [professionals, setProfessionals] = useState<PublicProfessional[]>([]),
    [local, setLocal] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [validation, setValidation] = useState(''),
    [ack, setAck] = useState(false),
    [options, setOptions] = useState<{
      key: string
      value: RoomOptions
    } | null>(null),
    [roomId, setRoomId] = useState(''),
    [roomBusy, setRoomBusy] = useState(false),
    [roomError, setRoomError] = useState(''),
    [retry, setRetry] = useState(0),
    [proError, setProError] = useState(false),
    [proRetry, setProRetry] = useState(0),
    [proBusy, setProBusy] = useState(false)
  const gate = useRef(false)
  const specialty = specialties.find((s) => s.id === specialtyId)
  let startsAt = ''
  try {
    startsAt = Temporal.PlainDateTime.from(local)
      .toZonedDateTime(context.clinicTimeZone, { disambiguation: 'reject' })
      .toInstant()
      .toString()
  } catch {}
  const key = [specialtyId, professionalId, visitType, startsAt, modality].join(
    ':',
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: proRetry é a releitura explícita após falha de catálogo.
  useEffect(() => {
    if (!specialtyId) return
    let active = true
    setProBusy(true)
    setProError(false)
    setProfessionals([])
    schedulingAvailability
      .professionals(specialtyId, modality)
      .then((values) => {
        if (active) setProfessionals(values)
      })
      .catch(() => {
        if (active) setProError(true)
      })
      .finally(() => {
        if (active) setProBusy(false)
      })
    return () => {
      active = false
    }
  }, [specialtyId, modality, proRetry])
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry renova a fotografia de salas; os demais campos identificam o intervalo.
  useEffect(() => {
    setRoomId('')
    setOptions(null)
    setRoomError('')
    if (modality === 'remote' || !startsAt || !specialtyId || !professionalId) {
      setRoomBusy(false)
      return
    }
    let active = true
    setRoomBusy(true)
    roomOptions({ professionalId, specialtyId, visitType, startsAt }, true)
      .then((value) => {
        if (active) {
          setOptions({ key, value })
          setRoomId(value.suggestedRoomId ?? '')
        }
      })
      .catch((cause) => {
        if (active)
          setRoomError(
            cause instanceof ApiError
              ? cause.message
              : 'Não foi possível conferir as salas.',
          )
      })
      .finally(() => {
        if (active) setRoomBusy(false)
      })
    return () => {
      active = false
    }
  }, [key, modality, startsAt, specialtyId, professionalId, visitType, retry])
  const rooms = options?.key === key ? options.value : null
  async function submit() {
    if (gate.current) return
    const core = z
      .object({
        patientId: z.uuid(),
        specialtyId: z.uuid(),
        professionalId: z.uuid(),
        startsAt: z.iso.datetime(),
        reason: z.string().trim().min(1).max(1000),
      })
      .safeParse({
        patientId: patient?.patientId,
        specialtyId,
        professionalId,
        startsAt,
        reason,
      })
    if (!core.success) {
      setValidation(
        'Selecione paciente, especialidade/profissional, horário local válido e justificativa. Horário ambíguo ou inexistente não é aceito.',
      )
      return
    }
    if (
      modality === 'onsite' &&
      (!rooms?.items.some((r) => r.id === roomId) || roomBusy)
    )
      return
    gate.current = true
    setBusy(true)
    setValidation('')
    try {
      const input = {
        ...core.data,
        modality,
        visitType,
        confirmDuplicateSpecialty: ack,
        ...(modality === 'onsite' && reception ? { roomId } : {}),
      }
      const command = await commandNonce([
        actorId,
        'fit-in',
        JSON.stringify(input),
      ])
      onDone(await waitlist.fitIn(input, command.key))
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'SERVICE_UNAVAILABLE'),
      )
    } finally {
      gate.current = false
      setBusy(false)
    }
  }
  function clear() {
    setAck(false)
    setError(null)
  }
  return (
    <form
      aria-label="Encaixe fora da grade"
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h2 className="font-heading text-xl font-semibold">
        Encaixe fora da grade
      </h2>
      <p className="text-sm text-muted-foreground">
        Somente em intervalo livre do profissional e da sala. O encaixe nunca
        permite sobreposição.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <SubjectPicker
          value={patient}
          onChange={(value) => {
            setPatient(value)
            clear()
          }}
          lookup={waitlist.candidate}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="fit-specialty">Especialidade do encaixe</label>
            <select
              id="fit-specialty"
              className={selectClass}
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value)
                setProfessionalId('')
                setModality(
                  specialties.find((s) => s.id === e.target.value)
                    ?.modalities[0] ?? 'onsite',
                )
                clear()
              }}
            >
              <option value="">Selecione</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="fit-modality">Modalidade do encaixe</label>
            <select
              id="fit-modality"
              className={selectClass}
              value={modality}
              onChange={(e) => {
                setModality(e.target.value as typeof modality)
                setProfessionalId('')
                clear()
              }}
            >
              {(specialty?.modalities ?? ['onsite']).map((m) => (
                <option key={m} value={m}>
                  {m === 'onsite' ? 'Presencial' : 'Online'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="fit-professional">Profissional do encaixe</label>
            <select
              id="fit-professional"
              className={selectClass}
              value={professionalId}
              disabled={proBusy || proError}
              onChange={(e) => {
                setProfessionalId(e.target.value)
                clear()
              }}
            >
              <option value="">Selecione</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="fit-visit">Tipo do encaixe</label>
            <select
              id="fit-visit"
              className={selectClass}
              value={visitType}
              onChange={(e) => {
                setVisitType(e.target.value as typeof visitType)
                clear()
              }}
            >
              <option value="first">Primeira consulta</option>
              <option value="return">Retorno</option>
            </select>
          </div>
          <TextField
            id="fit-local"
            label="Data e hora do encaixe"
            type="datetime-local"
            value={local}
            onChange={(e) => {
              setLocal(e.target.value)
              clear()
            }}
          />
        </div>
        {proError && (
          <ErrorState
            title="Não foi possível carregar profissionais"
            nextStep="Tente novamente antes de escolher o profissional."
            onRetry={() => setProRetry((v) => v + 1)}
          />
        )}
        {local && !startsAt && (
          <p role="alert" className="text-sm text-destructive">
            Horário local inexistente ou ambíguo neste fuso. Escolha outro
            horário.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Fuso: {context.clinicTimeZone}. Duração prevista:{' '}
          {specialty?.durations[visitType] ?? '—'} min, revalidada pelo
          servidor.
        </p>
        {modality === 'onsite' &&
          (roomBusy ? (
            <LoadingState label="Conferindo sala para encaixe…" />
          ) : roomError ? (
            <ErrorState
              title="Sala do encaixe indisponível"
              nextStep={roomError}
              onRetry={() => setRetry((v) => v + 1)}
            />
          ) : rooms?.items.length ? (
            <div className="grid gap-2">
              {reception ? (
                <>
                  <label htmlFor="fit-room">Sala livre do encaixe</label>
                  <select
                    id="fit-room"
                    className={selectClass}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    {rooms.items.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.id === rooms.suggestedRoomId ? ' (sugerida)' : ''}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="text-sm">
                  Sala sugerida:{' '}
                  {
                    rooms.items.find((r) => r.id === rooms.suggestedRoomId)
                      ?.name
                  }
                  . A alocação será automática na confirmação.
                </p>
              )}
            </div>
          ) : startsAt && professionalId ? (
            <p role="alert" className="text-sm">
              Não há sala livre ou profissional disponível. Escolha outro
              intervalo.
            </p>
          ) : null)}
        <TextField
          id="fit-reason"
          label="Justificativa do encaixe"
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
      </fieldset>
      {validation && (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      )}
      {error && (
        <div className="space-y-3">
          <ErrorState title="Encaixe não confirmado" nextStep={error.message} />
          {error.code === 'DUPLICATE_SPECIALTY_WARNING' && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Estou ciente de outra consulta nesta especialidade.
            </label>
          )}
          {(error.status === 0 || error.status >= 500) && (
            <p className="text-sm">
              Confira a agenda antes de repetir; a resposta pode ter se perdido.
            </p>
          )}
        </div>
      )}
      <Button
        type="submit"
        disabled={
          busy ||
          proBusy ||
          (modality === 'onsite' &&
            (!rooms?.items.some((r) => r.id === roomId) || roomBusy)) ||
          (error?.code === 'DUPLICATE_SPECIALTY_WARNING' && !ack)
        }
      >
        {busy ? 'Confirmando…' : 'Confirmar encaixe'}
      </Button>
    </form>
  )
}
