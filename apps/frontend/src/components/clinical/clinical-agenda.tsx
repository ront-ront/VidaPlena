'use client'
import { CalendarDays, Clock3, RefreshCw, Users } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import {
  type ClinicalAppointment,
  clinicalRecords,
} from '@/services/clinical-records'

const statuses: Record<
  ClinicalAppointment['status'],
  { label: string; tone: StatusTone }
> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  waiting: { label: 'Aguardando atendimento', tone: 'warning' },
  in_service: { label: 'Em atendimento', tone: 'info' },
  completed: { label: 'Finalizado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'error' },
  no_show: { label: 'Falta registrada', tone: 'neutral' },
}
type PageData = {
  items: ClinicalAppointment[]
  nextCursor: string | null
  localDate: string
  clinicTimeZone: string
  serverNow: string
  key: string
}
export function ClinicalAgendaView() {
  const { user } = useAuth(),
    allowed = !!user?.roles.includes('professional')
  const [date, setDate] = useState(''),
    [mode, setMode] = useState<'day' | 'queue'>('day'),
    [epoch, setEpoch] = useState(0),
    [data, setData] = useState<PageData | null>(null),
    [error, setError] = useState(false),
    [more, setMore] = useState(false)
  const key = `${date}:${mode}:${epoch}`
  const generation = useRef(0)
  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    generation.current++
    let active = true
    setData(null)
    setError(false)
    setMore(false)
    const load = async () => {
      if (mode === 'day')
        return clinicalRecords.day(
          date || undefined,
          undefined,
          controller.signal,
        )
      const context = await clinicalRecords.context(controller.signal),
        localDate = date || context.localDate
      return {
        ...context,
        localDate,
        ...(await clinicalRecords.queue(
          localDate,
          undefined,
          controller.signal,
        )),
      }
    }
    void load()
      .then((page) => {
        if (active) setData({ ...page, key })
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
      generation.current++
      controller.abort()
    }
  }, [allowed, date, mode, key])
  async function next() {
    if (!data?.nextCursor || more) return
    const version = generation.current
    setMore(true)
    try {
      const page =
        mode === 'day'
          ? await clinicalRecords.day(data.localDate, data.nextCursor)
          : await clinicalRecords.queue(data.localDate, data.nextCursor)
      setData((current) =>
        current?.key === key
          ? {
              ...current,
              items: [
                ...current.items,
                ...page.items.filter(
                  (item) => !current.items.some((old) => old.id === item.id),
                ),
              ],
              nextCursor: page.nextCursor,
            }
          : current,
      )
    } catch {
      if (version === generation.current) {
        setData(null)
        setError(true)
      }
    } finally {
      if (version === generation.current) setMore(false)
    }
  }
  if (!user) return <LoadingState />
  if (!allowed) return <ForbiddenState />
  const page = data?.key === key ? data : null
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CalendarDays aria-hidden="true" className="size-6 text-primary" />
            Agenda clínica
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seus atendimentos e pacientes aguardando cuidado.
          </p>
        </div>
        <Button variant="outline" onClick={() => setEpoch((v) => v + 1)}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Atualizar agenda
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            aria-pressed={mode === 'day'}
            variant={mode === 'day' ? 'default' : 'outline'}
            onClick={() => setMode('day')}
          >
            <CalendarDays aria-hidden="true" className="size-4" />
            Agenda do dia
          </Button>
          <Button
            aria-pressed={mode === 'queue'}
            variant={mode === 'queue' ? 'default' : 'outline'}
            onClick={() => setMode('queue')}
          >
            <Users aria-hidden="true" className="size-4" />
            Pacientes aguardando
          </Button>
        </div>
        <TextField
          id="clinical-agenda-date"
          label="Data da agenda"
          type="date"
          value={date || page?.localDate || ''}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {error ? (
        <ErrorState
          title="Não foi possível carregar a agenda clínica"
          nextStep="Tente novamente. Se o acesso continuar indisponível, confira seu cadastro profissional com a gestão."
          onRetry={() => {
            setError(false)
            setEpoch((v) => v + 1)
          }}
        />
      ) : !page ? (
        <LoadingState label="Carregando seus atendimentos…" />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Horários da clínica · {page.clinicTimeZone}
          </p>
          {page.items.length === 0 ? (
            <EmptyState
              title={
                mode === 'queue'
                  ? 'Nenhum paciente aguardando'
                  : 'Nenhum atendimento nesta data'
              }
              description={
                mode === 'queue'
                  ? 'A fila mostra apenas os pacientes com chegada registrada para seus atendimentos.'
                  : 'Escolha outra data ou confira sua oferta de atendimento.'
              }
            />
          ) : (
            <ul aria-label="Seus atendimentos" className="space-y-3">
              {page.items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1)"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Clock3
                          aria-hidden="true"
                          className="size-4 text-primary"
                        />
                        {new Intl.DateTimeFormat('pt-BR', {
                          timeZone: page.clinicTimeZone,
                          timeStyle: 'short',
                        }).format(new Date(row.startsAt))}
                      </p>
                      <StatusBadge {...statuses[row.status]} />
                    </div>
                    <h2 className="break-words text-base font-semibold">
                      {row.patient.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {row.specialty.name} ·{' '}
                      {row.modality === 'remote'
                        ? 'Online'
                        : `Presencial${row.room ? ` · ${row.room.name}` : ''}`}
                    </p>
                  </div>
                  <Link
                    className={buttonVariants()}
                    href={`/prontuarios/${row.patient.id}?appointmentId=${row.id}`}
                  >
                    Abrir prontuário
                    <span className="sr-only"> de {row.patient.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {page.nextCursor && (
            <Button
              variant="outline"
              disabled={more}
              onClick={() => void next()}
            >
              {more ? 'Carregando…' : 'Carregar mais atendimentos'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
