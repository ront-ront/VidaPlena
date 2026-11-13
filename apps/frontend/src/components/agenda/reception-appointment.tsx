'use client'
import { Dialog } from '@base-ui/react/dialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { AppointmentSearch } from '@/components/appointments/appointment-search'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { commandNonce } from '@/lib/booking-command'
import { ApiError, type AppointmentAlternative } from '@/services/api-client'
import {
  appointments,
  type BookingReceipt,
  bookingInput,
} from '@/services/appointments'
import {
  type BookingSelection,
  schedulingAvailability,
} from '@/services/availability'
import { onsiteRegistration } from '@/services/onsite-registration'
import {
  type OperationalAppointment,
  type RoomOptions,
  roomOptions,
} from '@/services/operational-agenda'

export type ReceptionAction = 'book' | 'reschedule' | 'cancel'
export function ReceptionAppointment({
  action,
  original,
  actorId,
  localDate,
  timeZone,
  serverNow,
  onClose,
  onDone,
}: {
  action: ReceptionAction
  original?: OperationalAppointment
  actorId: string
  localDate: string
  timeZone: string
  serverNow: string
  onClose: (refresh?: boolean) => void
  onDone: (receipt: BookingReceipt) => void
}) {
  const [selection, setSelection] = useState<BookingSelection | null>(null),
    [cpf, setCpf] = useState(''),
    [patient, setPatient] = useState<{
      patientId: string
      fullName: string
    } | null>(
      original
        ? { patientId: original.patient.id, fullName: original.patient.name }
        : null,
    ),
    [lookupBusy, setLookupBusy] = useState(false),
    [lookupError, setLookupError] = useState(''),
    [rooms, setRooms] = useState<{ key: string; value: RoomOptions } | null>(
      null,
    ),
    [roomId, setRoomId] = useState(''),
    [roomsBusy, setRoomsBusy] = useState(false),
    [roomsError, setRoomsError] = useState(''),
    [roomReload, setRoomReload] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [ack, setAck] = useState(false),
    [origin, setOrigin] = useState<'reception' | 'clinic'>('reception'),
    [reason, setReason] = useState(''),
    [reasonError, setReasonError] = useState(''),
    [volatile, setVolatile] = useState(false),
    gate = useRef(false),
    clock = useRef(performance.now())
  const key = selection
    ? `${selection.professional.id}:${selection.specialty.id}:${selection.slot.startsAt}:${selection.visitType}:${selection.modality}`
    : ''
  const activeRooms = rooms?.key === key ? rooms.value : null
  const format = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value))
  const currentNow = () =>
    Date.parse(serverNow) + performance.now() - clock.current
  const needsReason = () =>
    action !== 'book' &&
    (origin === 'clinic' ||
      (original &&
        (Date.parse(original.patientChangeDeadline) < currentNow() ||
          (action === 'cancel' &&
            original.administrativeFlags.includes('consent_revoked')))))
  const uncertain =
    error !== null && (error.status === 0 || error.status >= 500)
  // biome-ignore lint/correctness/useExhaustiveDependencies: roomReload renova explicitamente as opções sem alterar a seleção.
  useEffect(() => {
    if (!selection || selection.modality === 'remote' || action === 'cancel') {
      setRoomsBusy(false)
      setRooms(null)
      setRoomId('')
      setRoomsError('')
      return
    }
    let active = true
    setRoomsBusy(true)
    setRoomsError('')
    setRoomId('')
    setRooms(null)
    roomOptions({
      professionalId: selection.professional.id,
      specialtyId: selection.specialty.id,
      visitType: selection.visitType,
      startsAt: selection.slot.startsAt,
      ...(original
        ? { appointmentId: original.id, expectedVersion: original.version }
        : {}),
    })
      .then((value) => {
        if (active) {
          setRooms({ key, value })
          setRoomId(value.suggestedRoomId ?? '')
        }
      })
      .catch((cause) => {
        if (active)
          setRoomsError(
            cause instanceof ApiError
              ? cause.message
              : 'Não foi possível conferir as salas. Tente novamente.',
          )
      })
      .finally(() => {
        if (active) setRoomsBusy(false)
      })
    return () => {
      active = false
    }
  }, [selection, original, action, key, roomReload])
  const choose = useCallback((value: BookingSelection | null) => {
    setSelection(value)
    setAck(false)
    setError(null)
  }, [])
  async function lookup() {
    if (lookupBusy || gate.current) return
    const digits = cpf.replace(/\D/g, '')
    if (
      !z
        .string()
        .regex(/^\d{11}$/)
        .safeParse(digits).success
    ) {
      setLookupError('Informe o CPF completo com 11 dígitos.')
      return
    }
    setLookupBusy(true)
    setLookupError('')
    setPatient(null)
    try {
      setPatient(await onsiteRegistration.lookupPatient(digits))
    } catch (cause) {
      setLookupError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível localizar o paciente.',
      )
    } finally {
      setLookupBusy(false)
    }
  }
  async function alternative(slot: AppointmentAlternative) {
    if (gate.current) return
    gate.current = true
    setBusy(true)
    try {
      if (!selection) return
      const professionals = await schedulingAvailability.professionals(
        selection.specialty.id,
        selection.modality,
      )
      const professional = professionals.find(
        (p) => p.id === slot.professionalId,
      )
      if (!professional) throw new ApiError(409, 'SLOT_UNAVAILABLE')
      choose({ ...selection, professional, slot })
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
  async function submit() {
    if (
      gate.current ||
      !patient ||
      lookupBusy ||
      (action !== 'cancel' && !selection)
    )
      return
    if (
      action !== 'cancel' &&
      selection?.modality === 'onsite' &&
      (!activeRooms?.items.some((room) => room.id === roomId) || roomsBusy)
    )
      return
    if (error?.code === 'DUPLICATE_SPECIALTY_WARNING' && !ack) return
    const parsedReason = z.string().trim().max(1000).safeParse(reason)
    if (!parsedReason.success || (needsReason() && !reason.trim())) {
      setReasonError('Informe o motivo da alteração (até 1.000 caracteres).')
      return
    }
    setReasonError('')
    gate.current = true
    setBusy(true)
    try {
      const input =
        action === 'book' && selection
          ? {
              ...bookingInput(selection, patient.patientId, ack),
              ...(selection.modality === 'onsite' ? { roomId } : {}),
            }
          : null
      const change = {
        expectedVersion: original?.version ?? 0,
        origin,
        reason: reason.trim() || undefined,
        ...(action === 'reschedule' && selection
          ? {
              startsAt: selection.slot.startsAt,
              professionalId: selection.professional.id,
              modality: selection.modality,
              roomId: selection.modality === 'onsite' ? roomId : null,
            }
          : {}),
      }
      const body = input ?? change
      const command = await commandNonce([
        actorId,
        `reception:${action}`,
        original?.id ?? null,
        JSON.stringify(body),
      ])
      setVolatile(!command.persisted)
      const receipt = input
        ? await appointments.book(input, command.key)
        : await appointments.change(
            original?.id ?? '',
            action === 'cancel' ? 'cancel' : 'reschedule',
            change,
            command.key,
          )
      onDone(receipt)
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
  const disabled =
    busy ||
    lookupBusy ||
    !patient ||
    (action !== 'cancel' &&
      (!selection ||
        (selection.modality === 'onsite' &&
          (roomsBusy ||
            !activeRooms?.items.some((room) => room.id === roomId))))) ||
    (error?.code === 'DUPLICATE_SPECIALTY_WARNING' && !ack)
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !gate.current && !lookupBusy) onClose(uncertain)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/35" />
        <Dialog.Popup
          finalFocus={false}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl overflow-y-auto border-l border-border bg-card p-4 shadow-(--shadow-3) focus:outline-none sm:p-6"
        >
          <div className="space-y-5">
            <Dialog.Title className="font-heading text-2xl font-semibold">
              {action === 'book'
                ? 'Novo atendimento'
                : action === 'cancel'
                  ? 'Cancelar atendimento'
                  : 'Remarcar atendimento'}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {action === 'book'
                ? 'Localize o paciente cadastrado e confira o horário antes de confirmar.'
                : 'Confira a consulta original. A alteração só será efetivada após confirmação do servidor.'}
            </Dialog.Description>
            <fieldset
              disabled={busy || lookupBusy}
              className="min-w-0 space-y-5"
            >
              {action === 'book' && (
                <section
                  className="space-y-3 rounded-xl border border-border p-4"
                  aria-label="Identificar paciente"
                >
                  <TextField
                    id="reception-cpf"
                    label="CPF do paciente"
                    value={cpf}
                    maxLength={14}
                    error={lookupError}
                    onChange={(event) => {
                      setCpf(event.target.value)
                      setPatient(null)
                      setLookupError('')
                      setError(null)
                      setAck(false)
                    }}
                  />
                  <Button type="button" variant="outline" onClick={lookup}>
                    Localizar paciente
                  </Button>
                  {!patient && (
                    <p className="text-sm text-muted-foreground">
                      Para menor ou dependente, use o CPF do próprio paciente. O
                      consentimento e o responsável são conferidos no servidor.
                    </p>
                  )}
                </section>
              )}
              {patient && (
                <p role="status" className="font-semibold">
                  Paciente: {patient.fullName}
                </p>
              )}
              {lookupBusy && <LoadingState label="Localizando paciente…" />}
              <div
                className={
                  original && action !== 'cancel'
                    ? 'grid min-w-0 gap-4 lg:grid-cols-2'
                    : 'min-w-0'
                }
              >
                {original && (
                  <section
                    className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm"
                    aria-label="Consulta original"
                  >
                    <h2 className="font-semibold">Consulta original</h2>
                    <p>{original.patient.name}</p>
                    <p>
                      {original.specialty.name} · {original.professional.name}
                    </p>
                    <p>{format(original.startsAt)}</p>
                    <p>
                      {original.modality === 'onsite'
                        ? `Presencial · ${original.room?.name ?? 'Sala atribuída'}`
                        : 'Online'}
                    </p>
                    <p>
                      Prazo de autoatendimento:{' '}
                      {format(original.patientChangeDeadline)}. Após o prazo, a
                      recepção registra justificativa.
                    </p>
                  </section>
                )}
                {selection && action !== 'cancel' && (
                  <section
                    aria-label="Novo horário"
                    className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4 text-sm"
                  >
                    <h2 className="font-semibold">
                      {original ? 'Novo horário' : 'Horário a confirmar'}
                    </h2>
                    <p>
                      {selection.professional.displayName} ·{' '}
                      {selection.specialty.name}
                    </p>
                    <p>{format(selection.slot.startsAt)}</p>
                    <p>
                      {selection.modality === 'onsite'
                        ? 'Presencial'
                        : 'Online'}{' '}
                      ·{' '}
                      {selection.visitType === 'first'
                        ? 'Primeira consulta'
                        : 'Retorno'}
                    </p>
                  </section>
                )}
              </div>
              {action !== 'cancel' && (
                <AppointmentSearch
                  selection={selection}
                  onSelect={choose}
                  initialSearch={{
                    from: localDate,
                    ...(original
                      ? {
                          specialtyId: original.specialtyId,
                          visitType: original.visitType,
                          modality: original.modality,
                        }
                      : {}),
                  }}
                  fixedAppointment={!!original}
                />
              )}
              {selection?.modality === 'onsite' && action !== 'cancel' && (
                <section className="space-y-3" aria-label="Sala do atendimento">
                  <h2 className="font-semibold">Sala presencial</h2>
                  {roomsBusy ? (
                    <LoadingState label="Conferindo salas livres…" />
                  ) : roomsError ? (
                    <ErrorState
                      title="Não foi possível conferir as salas"
                      nextStep={roomsError}
                      onRetry={() => setRoomReload((v) => v + 1)}
                    />
                  ) : activeRooms?.items.length ? (
                    <>
                      <label
                        htmlFor="reception-room"
                        className="text-sm font-semibold"
                      >
                        Sala livre
                      </label>
                      <select
                        id="reception-room"
                        className={selectClass}
                        value={roomId}
                        onChange={(event) => setRoomId(event.target.value)}
                      >
                        {activeRooms.items.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.name}
                            {room.id === activeRooms.suggestedRoomId
                              ? ' (sugerida)'
                              : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Sugestão conferida para o intervalo. A disponibilidade é
                        revalidada na confirmação.
                      </p>
                    </>
                  ) : (
                    <p role="alert" className="text-sm">
                      Não há sala livre ou o profissional ficou indisponível.
                      Escolha outro horário.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={roomsBusy}
                    onClick={() => setRoomReload((v) => v + 1)}
                  >
                    Atualizar salas
                  </Button>
                </section>
              )}
              {action !== 'book' && (
                <section className="space-y-3">
                  <label
                    htmlFor="reception-origin"
                    className="text-sm font-semibold"
                  >
                    Origem da alteração
                  </label>
                  <select
                    id="reception-origin"
                    className={selectClass}
                    value={origin}
                    onChange={(e) =>
                      setOrigin(e.target.value as 'reception' | 'clinic')
                    }
                  >
                    <option value="reception">Solicitação na recepção</option>
                    <option value="clinic">Iniciativa da clínica</option>
                  </select>
                  <TextField
                    id="reception-reason"
                    label="Motivo da alteração"
                    help="Obrigatório fora do prazo de autoatendimento ou por iniciativa da clínica."
                    value={reason}
                    error={reasonError}
                    maxLength={1000}
                    onChange={(e) => {
                      setReason(e.target.value)
                      setReasonError('')
                    }}
                  />
                  {action === 'cancel' && (
                    <p className="text-sm">
                      Confirmar o cancelamento libera o horário e preserva o
                      registro no histórico. As notificações serão processadas
                      pelo sistema.
                    </p>
                  )}
                </section>
              )}
            </fieldset>
            {error && (
              <div className="space-y-3">
                <ErrorState
                  title="Operação não confirmada"
                  nextStep={error.message}
                />
                {error.code === 'DUPLICATE_SPECIALTY_WARNING' && (
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-primary"
                      disabled={busy}
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    Estou ciente de que já existe consulta futura nesta
                    especialidade e quero confirmar outra.
                  </label>
                )}
                {error.code === 'SLOT_UNAVAILABLE' &&
                  error.alternatives.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold">Horários alternativos</h3>
                      <div className="flex flex-wrap gap-2">
                        {error.alternatives.map((slot) => (
                          <Button
                            key={`${slot.professionalId}:${slot.startsAt}`}
                            type="button"
                            variant="outline"
                            disabled={
                              busy ||
                              (selection?.modality === 'onsite' &&
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
                {error.code === 'CONSENT_REQUIRED' && (
                  <p className="text-sm">
                    Confira o termo do paciente no cadastro presencial antes de
                    tentar novamente.
                  </p>
                )}
                {error.code === 'CONFLICT' && (
                  <p className="text-sm">
                    Feche o painel e atualize a agenda para conferir a versão
                    atual.
                  </p>
                )}
                {uncertain && (
                  <p className="text-sm">
                    O estado pode ter mudado. Feche e atualize a agenda antes de
                    repetir.
                  </p>
                )}
              </div>
            )}
            {volatile && (
              <p role="status" className="text-sm">
                O navegador bloqueou a persistência da chave. Confira a agenda
                antes de recarregar ou repetir a operação.
              </p>
            )}
            <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-border bg-card py-4">
              <Button
                type="button"
                variant={action === 'cancel' ? 'destructive' : 'default'}
                disabled={disabled}
                onClick={submit}
              >
                {busy
                  ? 'Salvando…'
                  : action === 'book'
                    ? 'Confirmar atendimento'
                    : action === 'cancel'
                      ? 'Confirmar cancelamento'
                      : 'Confirmar remarcação'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || lookupBusy}
                onClick={() => onClose(uncertain)}
              >
                {uncertain ? 'Fechar e conferir agenda' : 'Voltar sem alterar'}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
