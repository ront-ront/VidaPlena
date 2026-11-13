'use client'
import { Dialog } from '@base-ui/react/dialog'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { commandNonce } from '@/lib/booking-command'
import { ApiError, type AppointmentAlternative } from '@/services/api-client'
import {
  appointments,
  type BookingReceipt,
  type OwnAppointment,
} from '@/services/appointments'
import {
  type BookingSelection,
  schedulingAvailability,
} from '@/services/availability'
import { AppointmentSearch } from './appointment-search'

export function AppointmentChange({
  row,
  action,
  actorId,
  timeZone,
  deadlinePassed,
  onClose,
  onDone,
}: {
  row: OwnAppointment
  action: 'cancel' | 'reschedule'
  actorId: string
  timeZone: string
  deadlinePassed: () => boolean
  onClose: () => void
  onDone: (result: BookingReceipt) => void
}) {
  const [selection, setSelection] = useState<BookingSelection | null>(null),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [volatile, setVolatile] = useState(false),
    gate = useRef(false)
  const format = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value))
  async function submit() {
    if (gate.current || (action === 'reschedule' && !selection)) return
    if (deadlinePassed()) {
      setError(new ApiError(409, 'BOOKING_CHANGE_WINDOW'))
      return
    }
    gate.current = true
    setBusy(true)
    try {
      const input = {
        expectedVersion: row.version,
        origin: 'patient' as const,
        reason: reason.trim() || undefined,
        ...(action === 'reschedule' && selection
          ? {
              startsAt: selection.slot.startsAt,
              professionalId: selection.professional.id,
              modality: selection.modality,
            }
          : {}),
      }
      const command = await commandNonce([
        actorId,
        action,
        row.id,
        input.expectedVersion,
        input.reason ?? null,
        input.startsAt ?? null,
        input.professionalId ?? null,
        input.modality ?? null,
      ])
      setVolatile(!command.persisted)
      const result = await appointments.change(
        row.id,
        action,
        input,
        command.key,
      )
      onDone(result)
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
  async function alternative(slot: AppointmentAlternative) {
    if (gate.current) return
    gate.current = true
    setBusy(true)
    try {
      const modality = selection?.modality ?? row.modality
      const [specialties, professionals] = await Promise.all([
        schedulingAvailability.specialties(),
        schedulingAvailability.professionals(row.specialtyId, modality),
      ])
      const specialty = specialties.find((s) => s.id === row.specialtyId),
        professional = professionals.find((p) => p.id === slot.professionalId)
      if (!specialty || !professional)
        throw new ApiError(409, 'SLOT_UNAVAILABLE')
      setSelection({
        specialty,
        professional,
        slot,
        modality,
        visitType: row.visitType,
        clinicTimeZone: timeZone,
      })
      setError(null)
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
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !gate.current) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/35" />
        <Dialog.Popup className="fixed inset-x-3 top-1/2 z-50 mx-auto max-h-[90dvh] max-w-3xl -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-(--shadow-3) focus:outline-none sm:p-6">
          <div className="space-y-5">
            <Dialog.Title className="font-heading text-xl font-semibold">
              {action === 'cancel'
                ? 'Cancelar consulta?'
                : 'Reagendar consulta'}
            </Dialog.Title>
            <Dialog.Description className="text-sm leading-6 text-muted-foreground">
              {action === 'cancel'
                ? 'O cancelamento libera o horário e preserva seu registro no histórico. Confirme somente se deseja cancelar.'
                : 'Escolha um novo horário. Sua consulta atual permanece reservada até a confirmação da alteração.'}
            </Dialog.Description>
            <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm">
              <p className="font-semibold">Consulta atual</p>
              <p>
                {row.specialtyName ?? 'Especialidade do atendimento'} ·{' '}
                {row.professionalName ?? 'Profissional do atendimento'}
              </p>
              <p>{format(row.startsAt)}</p>
              <p>
                Alteração online permitida até{' '}
                {format(row.selfService.deadline)}. Depois, procure a recepção.
              </p>
            </div>
            <div inert={busy || undefined}>
              {action === 'reschedule' && (
                <AppointmentSearch
                  selection={selection}
                  onSelect={setSelection}
                  fixedAppointment
                  initialSearch={{
                    specialtyId: row.specialtyId,
                    visitType: row.visitType,
                    modality: row.modality,
                  }}
                />
              )}
              {selection && action === 'reschedule' && (
                <div
                  className="mt-4 rounded-xl border border-border bg-secondary/30 p-4 text-sm"
                  role="status"
                >
                  <p className="font-semibold">Novo horário a confirmar</p>
                  <p>
                    {format(selection.slot.startsAt)} ·{' '}
                    {selection.professional.displayName}
                  </p>
                  <p>
                    {selection.modality === 'onsite' ? 'Presencial' : 'Online'}{' '}
                    ·{' '}
                    {row.visitType === 'first'
                      ? 'Primeira consulta'
                      : 'Retorno'}
                  </p>
                </div>
              )}
              <div className="mt-4">
                <TextField
                  id="appointment-change-reason"
                  label="Motivo (opcional)"
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <div className="space-y-3">
                <ErrorState
                  title="Não foi possível confirmar a alteração"
                  nextStep={error.message}
                />
                {error.code === 'SLOT_UNAVAILABLE' &&
                  error.alternatives.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">
                        Alternativas para revisar
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {error.alternatives.map((slot) => (
                          <Button
                            key={`${slot.professionalId}:${slot.startsAt}`}
                            type="button"
                            variant="outline"
                            disabled={
                              busy ||
                              ((selection?.modality ?? row.modality) ===
                                'onsite' &&
                                !slot.roomAvailable)
                            }
                            onClick={() => alternative(slot)}
                          >
                            {format(slot.startsAt)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                {(error.status === 0 || error.status >= 500) && (
                  <p className="text-sm">
                    O estado pode ter mudado. Feche esta revisão e use Atualizar
                    consultas para conferir antes de tentar novamente.
                  </p>
                )}
                {error.code === 'CONFLICT' && (
                  <p className="text-sm">
                    Feche esta revisão e atualize a lista para conferir a versão
                    atual da consulta.
                  </p>
                )}
              </div>
            )}
            {volatile && (
              <p role="status" className="text-sm">
                O navegador bloqueou a persistência da chave. Antes de
                recarregar, confira a consulta para evitar repetição sem a chave
                original.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant={action === 'cancel' ? 'destructive' : 'default'}
                disabled={
                  busy ||
                  (action === 'reschedule' && !selection) ||
                  error?.code === 'BOOKING_CHANGE_WINDOW'
                }
                onClick={submit}
              >
                {busy
                  ? 'Salvando…'
                  : action === 'cancel'
                    ? 'Confirmar cancelamento'
                    : 'Confirmar novo horário'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                Voltar sem alterar
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
