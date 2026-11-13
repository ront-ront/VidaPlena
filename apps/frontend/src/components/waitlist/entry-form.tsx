'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { weekdayNames } from '@/lib/schedule-validation'
import { ApiError } from '@/services/api-client'
import type { PublicSpecialty } from '@/services/availability'
import { onsiteRegistration } from '@/services/onsite-registration'
import {
  type SchedulingContext,
  waitlist,
  waitlistInputSchema,
} from '@/services/waitlist'
import { SubjectPicker, type WaitingSubject } from './subject-picker'
export function WaitlistEntryForm({
  context,
  specialties,
  subjects,
  onDone,
}: {
  context: SchedulingContext
  specialties: PublicSpecialty[]
  subjects?: WaitingSubject[]
  onDone: () => void
}) {
  const [patient, setPatient] = useState<WaitingSubject | null>(
      subjects?.[0] ?? null,
    ),
    [specialtyId, setSpecialtyId] = useState(''),
    [modality, setModality] = useState<'onsite' | 'remote'>('onsite'),
    [visitType, setVisitType] = useState<'first' | 'return'>('first'),
    [from, setFrom] = useState(context.localDate),
    [to, setTo] = useState(context.localDate),
    [preferences, setPreferences] = useState([
      {
        key: crypto.randomUUID(),
        weekdays: [] as number[],
        localStart: '',
        localEnd: '',
      },
    ]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [validation, setValidation] = useState('')
  const gate = useRef(false)
  const specialty = specialties.find((s) => s.id === specialtyId)
  async function submit() {
    if (gate.current) return
    const parsed = waitlistInputSchema.safeParse({
      patientId: patient?.patientId,
      specialtyId,
      modality,
      visitType,
      dateFrom: from,
      dateTo: to,
      timePreferences: preferences.map(
        ({ weekdays, localStart, localEnd }) => ({
          weekdays,
          localStart,
          localEnd,
        }),
      ),
    })
    if (!parsed.success) {
      setValidation(
        'Selecione paciente/especialidade, datas válidas e pelo menos um dia e intervalo em cada faixa.',
      )
      return
    }
    gate.current = true
    setBusy(true)
    setValidation('')
    setError(null)
    try {
      await waitlist.enter(parsed.data)
      onDone()
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
  return (
    <form
      aria-label="Inscrição na lista de espera"
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h2 className="font-heading text-xl font-semibold">
        Entrar na lista de espera
      </h2>
      <fieldset disabled={busy} className="space-y-4">
        <SubjectPicker
          subjects={subjects}
          value={patient}
          onChange={setPatient}
          lookup={onsiteRegistration.lookupPatient}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="wait-specialty">Especialidade</label>
            <select
              id="wait-specialty"
              className={selectClass}
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value)
                const next = specialties.find((s) => s.id === e.target.value)
                setModality(next?.modalities[0] ?? 'onsite')
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
            <label htmlFor="wait-modality">Modalidade</label>
            <select
              id="wait-modality"
              className={selectClass}
              value={modality}
              onChange={(e) => setModality(e.target.value as typeof modality)}
            >
              {(specialty?.modalities ?? ['onsite']).map((m) => (
                <option key={m} value={m}>
                  {m === 'onsite' ? 'Presencial' : 'Online'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="wait-visit">Tipo de atendimento</label>
            <select
              id="wait-visit"
              className={selectClass}
              value={visitType}
              onChange={(e) => setVisitType(e.target.value as typeof visitType)}
            >
              <option value="first">Primeira consulta</option>
              <option value="return">Retorno</option>
            </select>
          </div>
          <TextField
            id="wait-from"
            label="Data inicial"
            type="date"
            value={from}
            min={context.localDate}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            id="wait-to"
            label="Data final"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {preferences.map((p, index) => (
          <fieldset
            key={p.key}
            className="space-y-3 rounded-xl border border-border p-4"
          >
            <legend className="px-2 font-semibold">Faixa {index + 1}</legend>
            <div className="flex flex-wrap gap-3">
              {weekdayNames.map((name, i) => (
                <label
                  key={name}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={p.weekdays.includes(i + 1)}
                    onChange={(e) =>
                      setPreferences(
                        preferences.map((v) =>
                          v.key === p.key
                            ? {
                                ...v,
                                weekdays: e.target.checked
                                  ? [...v.weekdays, i + 1]
                                  : v.weekdays.filter((d) => d !== i + 1),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id={`${p.key}-start`}
                label="Horário inicial"
                type="time"
                value={p.localStart}
                onChange={(e) =>
                  setPreferences(
                    preferences.map((v) =>
                      v.key === p.key
                        ? { ...v, localStart: e.target.value }
                        : v,
                    ),
                  )
                }
              />
              <TextField
                id={`${p.key}-end`}
                label="Horário final"
                type="time"
                value={p.localEnd}
                onChange={(e) =>
                  setPreferences(
                    preferences.map((v) =>
                      v.key === p.key ? { ...v, localEnd: e.target.value } : v,
                    ),
                  )
                }
              />
            </div>
            {preferences.length > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setPreferences(preferences.filter((v) => v.key !== p.key))
                }
              >
                Remover faixa {index + 1}
              </Button>
            )}
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={preferences.length >= 14}
          onClick={() =>
            setPreferences([
              ...preferences,
              {
                key: crypto.randomUUID(),
                weekdays: [],
                localStart: '',
                localEnd: '',
              },
            ])
          }
        >
          Adicionar faixa
        </Button>
      </fieldset>
      {validation && (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <ErrorState
            title="Inscrição não confirmada"
            nextStep={error.message}
          />
          {error.code === 'WAITLIST_NOT_NEEDED' && (
            <Link
              href={subjects ? '/agendar' : '/agenda'}
              className="font-semibold text-primary underline"
            >
              Voltar à busca de horários
            </Link>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Faixas no fuso {context.clinicTimeZone}. Inscrição não garante
        atendimento nem prazo de oferta.
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? 'Enviando…' : 'Confirmar inscrição'}
      </Button>
    </form>
  )
}
