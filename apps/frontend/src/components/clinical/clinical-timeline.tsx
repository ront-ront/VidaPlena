'use client'
import { Temporal } from '@js-temporal/polyfill'
import { Filter, History, RefreshCw } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { EmptyState, LoadingState } from '@/components/ui/feedback'
import { Label, TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  type PublicSpecialty,
  schedulingAvailability,
} from '@/services/availability'
import {
  type ClinicalFilters,
  type ClinicalTimeline,
  clinicalRecords,
  clinicalTimelineTypes,
} from '@/services/clinical-records'
import { clinicalDate, useClinicalRecord } from './clinical-record-shell'
export const timelineLabels = {
  encounter: 'Atendimento',
  evolution: 'Evolução clínica',
  prescription: 'Prescrição',
  exam_order: 'Pedido de exames',
  exam_result: 'Resultado de exame',
  document: 'Documento clínico',
  imported_history: 'Histórico importado',
}
const filterSchema = z
  .object({
    from: z.union([z.literal(''), z.iso.date()]),
    to: z.union([z.literal(''), z.iso.date()]),
    specialtyId: z.union([z.literal(''), z.uuid()]),
    type: z.union([z.literal(''), z.enum(clinicalTimelineTypes)]),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'A data final deve ser igual ou posterior à inicial.',
  })
export function ClinicalTimelineView() {
  const { header, clinicTimeZone, fail, reload } = useClinicalRecord()
  const [form, setForm] = useState({
      from: '',
      to: '',
      specialtyId: '',
      type: '',
    }),
    [filters, setFilters] = useState<ClinicalFilters>({}),
    [validation, setValidation] = useState(''),
    [specialties, setSpecialties] = useState<PublicSpecialty[]>([]),
    [data, setData] = useState<{ key: string; page: ClinicalTimeline } | null>(
      null,
    ),
    [more, setMore] = useState(false)
  const key = JSON.stringify(filters),
    generation = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    generation.current++
    setData(null)
    setMore(false)
    void Promise.all([
      clinicalRecords.timeline(
        header.patient.id,
        filters,
        undefined,
        controller.signal,
      ),
      schedulingAvailability.specialties(),
    ])
      .then(([page, items]) => {
        if (active) {
          setData({ key, page })
          setSpecialties(items)
        }
      })
      .catch((error) => {
        if (active) fail(error)
      })
    return () => {
      active = false
      generation.current++
      controller.abort()
    }
  }, [header.patient.id, filters, key, fail])
  async function next() {
    if (!data?.page.nextCursor || more) return
    const version = generation.current
    setMore(true)
    try {
      const page = await clinicalRecords.timeline(
        header.patient.id,
        filters,
        data.page.nextCursor,
      )
      if (version === generation.current)
        setData((current) =>
          current?.key === key
            ? {
                key,
                page: {
                  ...page,
                  items: [
                    ...current.page.items,
                    ...page.items.filter(
                      (item) =>
                        !current.page.items.some(
                          (old) => old.id === item.id && old.type === item.type,
                        ),
                    ),
                  ],
                },
              }
            : current,
        )
    } catch (error) {
      if (version === generation.current) fail(error)
    } finally {
      if (version === generation.current) setMore(false)
    }
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = filterSchema.safeParse(form)
    if (!parsed.success) {
      setValidation(
        'Confira as datas e use um período com término igual ou posterior ao início.',
      )
      return
    }
    setValidation('')
    const instant = (value: string, end = false) =>
      Temporal.PlainDate.from(value)
        .add({ days: end ? 1 : 0 })
        .toZonedDateTime({ timeZone: clinicTimeZone, plainTime: '00:00' })
        .toInstant()
        .toString()
    setFilters({
      ...(form.from ? { from: instant(form.from) } : {}),
      ...(form.to ? { to: instant(form.to, true) } : {}),
      ...(form.specialtyId ? { specialtyId: form.specialtyId } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
    })
  }
  const page = data?.key === key ? data.page : null
  return (
    <section
      aria-labelledby="timeline-title"
      className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1)"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="timeline-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <History aria-hidden="true" className="size-5 text-primary" />
            Histórico clínico
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Registros autorizados, do mais recente ao mais antigo.
          </p>
        </div>
        <Button variant="outline" onClick={reload}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Atualizar acesso
        </Button>
      </div>
      {header.linkBasis.scope !== 'pre' && (
        <form
          onSubmit={apply}
          className="mb-6 space-y-3 rounded-xl bg-muted p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              id="clinical-from"
              label="De"
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
            <TextField
              id="clinical-to"
              label="Até (inclusive)"
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
            <div className="grid gap-2">
              <Label htmlFor="clinical-specialty">Especialidade</Label>
              <select
                id="clinical-specialty"
                className={selectClass}
                value={form.specialtyId}
                onChange={(e) =>
                  setForm({ ...form, specialtyId: e.target.value })
                }
              >
                <option value="">Todas as especialidades</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="clinical-type">Tipo de registro</Label>
              <select
                id="clinical-type"
                className={selectClass}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="">Todos os tipos</option>
                {clinicalTimelineTypes.map((type) => (
                  <option key={type} value={type}>
                    {timelineLabels[type]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {validation && (
            <p role="alert" className="text-sm text-destructive">
              {validation}
            </p>
          )}
          <Button type="submit" variant="secondary">
            <Filter aria-hidden="true" className="size-4" />
            Aplicar filtros
          </Button>
        </form>
      )}
      {!page ? (
        <LoadingState label="Carregando histórico…" />
      ) : page.restricted ? (
        <EmptyState
          title="Leitura pré-consulta limitada"
          description="Identificação e alertas estão disponíveis. O histórico completo será liberado conforme o vínculo assistencial."
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          title={
            header.firstVisit && Object.keys(filters).length === 0
              ? 'Primeira consulta'
              : 'Nenhum registro neste período'
          }
          description={
            header.firstVisit && Object.keys(filters).length === 0
              ? 'Ainda não há atendimentos concluídos ou registros anteriores neste prontuário.'
              : 'Ajuste os filtros ou confira novamente após o atendimento.'
          }
        />
      ) : (
        <>
          <ol className="ml-1.5 space-y-7 border-l-2 border-secondary pl-5">
            {page.items.map((item) => (
              <li key={`${item.type}:${item.id}`} className="relative min-w-0">
                <span
                  aria-hidden="true"
                  className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-card bg-primary"
                />
                <p className="text-xs text-muted-foreground">
                  {clinicalDate(item.date, clinicTimeZone)}
                </p>
                <h3 className="mt-1 text-sm font-semibold">
                  {timelineLabels[item.type]}
                </h3>
                <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {item.summary}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {[
                    item.professional?.name,
                    item.specialty?.name,
                    item.modality === 'remote'
                      ? 'Online'
                      : item.modality === 'onsite'
                        ? 'Presencial'
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {item.importedOrigin && (
                  <div className="mt-2 space-y-1">
                    <StatusBadge tone="neutral" label="Histórico importado" />
                    <p className="break-words text-xs text-muted-foreground">
                      {item.importedOrigin.origin} · Digitalização/importação:{' '}
                      {clinicalDate(
                        item.importedOrigin.importedAt,
                        clinicTimeZone,
                      )}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {page.nextCursor && (
            <Button
              className="mt-6"
              variant="outline"
              disabled={more}
              onClick={() => void next()}
            >
              {more ? 'Carregando…' : 'Carregar registros anteriores'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
