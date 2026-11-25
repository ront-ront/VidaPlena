'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { FieldError, Label } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/services/api-client'
import { type AbsenceKind, arrivals } from '@/services/arrivals'
import type { OperationalAppointment } from '@/services/operational-agenda'

export const absenceNames = {
  unjustified: 'Não justificada',
  justified: 'Justificada',
  clinic_fault: 'Falha da clínica',
}
export function ArrivalActions({
  row,
  receptionist,
  canCheckIn,
  timeZone,
  onDone,
}: {
  row: OperationalAppointment
  receptionist: boolean
  canCheckIn: boolean
  timeZone: string
  onDone: (message: string) => void
}) {
  const [kind, setKind] = useState<AbsenceKind>(
    row.absence?.kind ?? 'unjustified',
  )
  const [explanation, setExplanation] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof arrivals.history>
  > | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const [historyReload, setHistoryReload] = useState(0)
  const gate = useRef(false)
  const canDecideLate =
    receptionist && row.status === 'waiting' && row.checkIn?.lateFlag
  // biome-ignore lint/correctness/useExhaustiveDependencies: historyReload renova leitura após erro.
  useEffect(() => {
    if (!row.absence) return
    let active = true
    setHistory(null)
    setHistoryError(false)
    arrivals
      .history(row.id)
      .then((result) => {
        if (active) setHistory(result)
      })
      .catch(() => {
        if (active) setHistoryError(true)
      })
    return () => {
      active = false
    }
  }, [row.id, row.absence?.version, historyReload])
  async function perform(checkIn: boolean) {
    if (gate.current) return
    if (
      !checkIn &&
      (row.absence || kind !== 'unjustified') &&
      !explanation.trim()
    ) {
      setError('Informe a justificativa administrativa.')
      return
    }
    if (explanation.trim().length > 1000) {
      setError('Use até 1.000 caracteres na justificativa.')
      return
    }
    gate.current = true
    setBusy(true)
    setError('')
    try {
      if (checkIn) {
        const result = await arrivals.checkIn(row.id)
        onDone(
          `Chegada registrada. Aguardando atendimento.${result.lateFlag ? ' Chegada com atraso: confira as opções de manter, remarcar ou encaixar nos detalhes.' : ''}`,
        )
      } else {
        const result = await arrivals.decide(row.id, {
          kind,
          ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
          ...(row.absence ? { expectedVersion: row.absence.version } : {}),
        })
        onDone(
          `Ausência ${absenceNames[result.kind].toLocaleLowerCase('pt-BR')} registrada. ${result.autoBookingSuspended ? 'Autoagendamento suspenso; atendimento assistido permanece disponível.' : 'Autoagendamento sem suspensão vigente.'}`,
        )
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status > 0 && cause.status < 500
          ? `${cause.message} Feche os detalhes e atualize a agenda antes de tentar novamente.`
          : 'Não foi possível confirmar o resultado. Feche os detalhes e atualize a agenda antes de repetir.',
      )
    } finally {
      gate.current = false
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Chegada e ausência"
      className="space-y-4 border-t border-border pt-4"
    >
      {error && <FieldError>{error}</FieldError>}
      {receptionist &&
        row.status === 'confirmed' &&
        row.modality === 'onsite' && (
          <Button
            type="button"
            disabled={busy || !canCheckIn}
            onClick={() => void perform(true)}
          >
            Registrar chegada
          </Button>
        )}
      {canDecideLate && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onDone('Atendimento mantido na fila, sem alterar a reserva.')
          }
        >
          Manter na fila
        </Button>
      )}
      {canDecideLate && (
        <p className="text-sm">
          Chegada com atraso. Você pode manter o atendimento na fila, usar
          Reagendar ou procurar um horário livre em{' '}
          <Link className="font-semibold underline" href="/agenda/espera">
            Lista de espera e encaixe
          </Link>
          . Para substituir este atendimento por um encaixe, resolva a reserva
          original antes; não há sobreposição permitida.
        </p>
      )}
      {row.absence && (
        <div className="space-y-2 text-sm">
          <p>
            Classificação: {absenceNames[row.absence.kind]} · versão{' '}
            {row.absence.version}. Correções preservam as revisões anteriores.
          </p>
          {historyError ? (
            <ErrorState
              title="Não foi possível consultar o histórico"
              nextStep="Tente novamente."
              onRetry={() => setHistoryReload((value) => value + 1)}
            />
          ) : !history ? (
            <LoadingState label="Carregando histórico de ausência…" />
          ) : (
            <ol className="space-y-2" aria-label="Histórico de ausência">
              {history.items.map((item) => (
                <li
                  key={item.version}
                  className="rounded-lg border border-border p-3"
                >
                  Versão {item.version}: {absenceNames[item.kind]} ·{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone,
                  }).format(new Date(item.occurredAt))}
                  {item.explanation && (
                    <p className="whitespace-pre-wrap break-words">
                      {item.explanation}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {(row.absence || (receptionist && row.status === 'confirmed')) && (
        <>
          {!editing ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || (!row.absence && !row.noShowEligible)}
              onClick={() => setEditing(true)}
            >
              {row.absence ? 'Corrigir classificação' : 'Conferir ausência'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="absence-kind">Classificação da ausência</Label>
              <select
                id="absence-kind"
                className={selectClass}
                value={kind}
                disabled={busy}
                onChange={(event) => setKind(event.target.value as AbsenceKind)}
              >
                {Object.entries(absenceNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Label htmlFor="absence-explanation">
                Justificativa administrativa
              </Label>
              <Textarea
                id="absence-explanation"
                value={explanation}
                disabled={busy}
                onChange={(event) => setExplanation(event.target.value)}
                aria-describedby="absence-help"
              />
              <p id="absence-help" className="text-xs text-muted-foreground">
                Não informe conteúdo clínico. Correções e classificações não
                punitivas exigem justificativa. A confirmação é manual.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void perform(false)}
                >
                  {busy ? 'Registrando…' : 'Confirmar classificação'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Voltar sem registrar
                </Button>
              </div>
            </div>
          )}
          {!row.absence && !row.noShowEligible && (
            <p className="text-xs text-muted-foreground">
              Conferência indisponível nesta fotografia da agenda. Atualize após
              o prazo definido pela clínica; nenhuma falta é registrada
              automaticamente.
            </p>
          )}
        </>
      )}
    </section>
  )
}
