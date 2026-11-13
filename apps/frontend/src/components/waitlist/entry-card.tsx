'use client'
import { Dialog } from '@base-ui/react/dialog'
import { Temporal } from '@js-temporal/polyfill'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/feedback'
import { StatusBadge } from '@/components/ui/status-badge'
import { commandNonce } from '@/lib/booking-command'
import { weekdayNames } from '@/lib/schedule-validation'
import { ApiError } from '@/services/api-client'
import type { BookingReceipt } from '@/services/appointments'
import { type WaitlistEntry, waitlist } from '@/services/waitlist'
export function WaitlistEntryCard({
  entry,
  name,
  specialty,
  timeZone,
  now,
  actorId,
  portal,
  onDone,
  onReceipt,
}: {
  entry: WaitlistEntry
  name: string
  specialty: string
  timeZone: string
  now: number
  actorId: string
  portal: boolean
  onDone: () => void
  onReceipt: (result: BookingReceipt) => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [ack, setAck] = useState(false),
    [leaving, setLeaving] = useState(false),
    gate = useRef(false)
  const format = (v: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(v))
  const offer = entry.offer,
    expired =
      !!offer &&
      (offer.status !== 'active' ||
        Date.parse(offer.expiresAt) <= now ||
        error?.code === 'OFFER_EXPIRED')
  async function accept() {
    if (
      gate.current ||
      !offer ||
      expired ||
      (error?.code === 'DUPLICATE_SPECIALTY_WARNING' && !ack)
    )
      return
    gate.current = true
    setBusy(true)
    try {
      const key = await commandNonce([
        actorId,
        'waitlist.accept',
        offer.id,
        entry.patientId,
        ack,
      ])
      const result = await waitlist.accept(
        offer.id,
        entry.patientId,
        ack,
        key.key,
      )
      onReceipt(result)
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
  async function leave() {
    if (gate.current) return
    gate.current = true
    setBusy(true)
    try {
      await waitlist.leave(entry.id)
      setLeaving(false)
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
    <article className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold">{specialty}</h3>
          <p className="text-sm">{name}</p>
        </div>
        <StatusBadge
          tone={
            entry.status === 'offered'
              ? 'info'
              : entry.status === 'fulfilled'
                ? 'success'
                : 'neutral'
          }
          label={
            {
              waiting: 'Na espera',
              offered: 'Oferta disponível',
              fulfilled: 'Atendido pela oferta',
              cancelled: 'Saiu da espera',
            }[entry.status]
          }
        />
      </div>
      <p className="text-sm">
        Entrada: {format(entry.queuedAt)} · Posição informada: {entry.position}
      </p>
      <p className="text-sm">
        {Temporal.PlainDate.from(entry.dateFrom).toLocaleString('pt-BR')} a{' '}
        {Temporal.PlainDate.from(entry.dateTo).toLocaleString('pt-BR')} ·{' '}
        {entry.modality === 'onsite' ? 'Presencial' : 'Online'}
      </p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {entry.timePreferences.map((p) => (
          <li key={`${p.localStart}:${p.localEnd}:${p.weekdays.join(',')}`}>
            {p.weekdays.map((d) => weekdayNames[d - 1]).join(', ')} ·{' '}
            {p.localStart}–{p.localEnd}
          </li>
        ))}
      </ul>
      {offer && (
        <section
          aria-label="Oferta de horário"
          className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
        >
          <h4 className="font-semibold">
            {expired ? 'Oferta encerrada ou expirada' : 'Horário oferecido'}
          </h4>
          <p>
            {format(offer.startsAt)} · {offer.professionalName}
          </p>
          <p className="text-sm">
            Prazo para aceitar: {format(offer.expiresAt)}
          </p>
          {!expired && (
            <p role="status" className="text-sm">
              Tempo restante aproximado:{' '}
              {Math.ceil((Date.parse(offer.expiresAt) - now) / 60000)} min
            </p>
          )}
          {offer.manualContactRequired && !portal && (
            <p className="text-sm font-semibold">
              Contato manual necessário. Confirme o interesse do paciente antes
              do aceite assistido.
            </p>
          )}
          <Button
            type="button"
            disabled={
              busy ||
              expired ||
              (error?.code === 'DUPLICATE_SPECIALTY_WARNING' && !ack)
            }
            onClick={accept}
          >
            {busy ? 'Processando…' : 'Aceitar horário'}
          </Button>
          {expired && (
            <Link
              href={portal ? '/agendar' : '/agenda'}
              className="block text-sm font-semibold text-primary underline"
            >
              Buscar outro horário
            </Link>
          )}
        </section>
      )}
      {error && (
        <div className="space-y-3">
          <ErrorState title="Ação não confirmada" nextStep={error.message} />
          {error.code === 'DUPLICATE_SPECIALTY_WARNING' && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={ack}
                disabled={busy}
                onChange={(e) => setAck(e.target.checked)}
              />
              Estou ciente de outra consulta nesta especialidade.
            </label>
          )}
          {(error.status === 0 || error.status >= 500) && (
            <p className="text-sm">
              O estado pode ter mudado. Atualize a lista antes de repetir.
            </p>
          )}
        </div>
      )}
      {['waiting', 'offered'].includes(entry.status) && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setLeaving(true)}
        >
          Sair da espera
        </Button>
      )}
      <Dialog.Root
        open={leaving}
        onOpenChange={(value) => {
          if (!busy) setLeaving(value)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/35" />
          <Dialog.Popup className="fixed inset-x-3 top-1/2 z-50 mx-auto max-w-lg -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-card p-5">
            <Dialog.Title className="font-heading text-xl font-semibold">
              Sair da lista de espera?
            </Dialog.Title>
            <Dialog.Description className="text-sm">
              Uma oferta pendente será liberada. O histórico da inscrição será
              preservado.
            </Dialog.Description>
            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={busy} onClick={leave}>
                Confirmar saída
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setLeaving(false)}
              >
                Continuar na espera
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </article>
  )
}
