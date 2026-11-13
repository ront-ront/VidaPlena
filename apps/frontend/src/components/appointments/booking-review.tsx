'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { selectClass } from '@/components/ui/select'
import { bookingCommand } from '@/lib/booking-command'
import { ApiError, type AppointmentAlternative } from '@/services/api-client'
import {
  appointmentStatus,
  appointments,
  type BookingReceipt,
  bookingInput,
} from '@/services/appointments'
import {
  type BookingSelection,
  schedulingAvailability,
} from '@/services/availability'
import { myAccount } from '@/services/my-account'
import type { CurrentUser } from '@/services/session'

type Subject = { patientId: string; fullName: string }
export function BookingReview({
  user,
  selection,
  onBack,
  onSelect,
  onBusy,
}: {
  user: CurrentUser
  selection: BookingSelection
  onBack: () => void
  onSelect: (selection: BookingSelection) => void
  onBusy: (busy: boolean) => void
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]),
    [patientId, setPatientId] = useState(user.patientId ?? ''),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(false),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [acknowledged, setAcknowledged] = useState(false),
    [receipt, setReceipt] = useState<BookingReceipt | null>(null),
    [volatile, setVolatile] = useState(false),
    gate = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    notice = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload é o comando explícito de nova leitura.
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    myAccount
      .dependents()
      .then(({ items }) => {
        if (!active) return
        const values = new Map<string, Subject>()
        if (user.patientId)
          values.set(user.patientId, {
            patientId: user.patientId,
            fullName: user.profile.fullName,
          })
        for (const dep of items)
          if (dep.status === 'active' && !values.has(dep.patientId))
            values.set(dep.patientId, dep)
        const available = [...values.values()]
        setSubjects(available)
        setPatientId((current) =>
          available.some((s) => s.patientId === current)
            ? current
            : available.length === 1
              ? available[0].patientId
              : '',
        )
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reload, user.patientId, user.profile.fullName])
  // biome-ignore lint/correctness/useExhaustiveDependencies: outra seleção invalida recibo e ciência anteriores, preservando o sujeito.
  useEffect(() => {
    setError(null)
    setReceipt(null)
    setAcknowledged(false)
    heading.current?.focus()
  }, [
    selection.slot.startsAt,
    selection.professional.id,
    selection.specialty.id,
    selection.modality,
    selection.visitType,
  ])
  useEffect(() => {
    if (error || receipt) notice.current?.focus()
  }, [error, receipt])
  const format = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: selection.clinicTimeZone,
    }).format(new Date(value))
  async function confirm() {
    if (
      gate.current ||
      !subjects.some((s) => s.patientId === patientId) ||
      (error?.code === 'DUPLICATE_SPECIALTY_WARNING' && !acknowledged)
    )
      return
    gate.current = true
    setBusy(true)
    onBusy(true)
    try {
      const input = bookingInput(selection, patientId, acknowledged)
      const command = await bookingCommand(user.id, input)
      setVolatile(!command.persisted)
      const result = await appointments.book(input, command.key)
      setReceipt(result)
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
      onBusy(false)
    }
  }
  async function alternative(slot: AppointmentAlternative) {
    if (gate.current) return
    gate.current = true
    setBusy(true)
    onBusy(true)
    try {
      const professional =
        slot.professionalId === selection.professional.id
          ? selection.professional
          : (
              await schedulingAvailability.professionals(
                selection.specialty.id,
                selection.modality,
              )
            ).find((p) => p.id === slot.professionalId)
      if (!professional) throw new ApiError(409, 'SLOT_UNAVAILABLE')
      onSelect({ ...selection, professional, slot })
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'SERVICE_UNAVAILABLE'),
      )
    } finally {
      gate.current = false
      setBusy(false)
      onBusy(false)
    }
  }
  const duplicate = error?.code === 'DUPLICATE_SPECIALTY_WARNING'
  return (
    <section
      aria-labelledby="selected-booking"
      className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1)"
    >
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Revise seu atendimento
        </p>
        <h2
          id="selected-booking"
          ref={heading}
          tabIndex={-1}
          className="font-heading text-xl font-semibold outline-none"
        >
          {receipt ? 'Agendamento registrado' : 'Horário selecionado'}
        </h2>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Especialidade</dt>
          <dd className="font-semibold">
            {receipt?.appointment.specialtyName ?? selection.specialty.name}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Profissional</dt>
          <dd className="font-semibold">
            {receipt?.appointment.professionalName ??
              selection.professional.displayName}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data e hora</dt>
          <dd className="font-semibold">
            {format(receipt?.appointment.startsAt ?? selection.slot.startsAt)}
          </dd>
          <dd className="text-xs text-muted-foreground">
            Fuso: {selection.clinicTimeZone}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Atendimento</dt>
          <dd>
            {(receipt?.appointment.modality ?? selection.modality) === 'onsite'
              ? 'Presencial'
              : 'Online'}{' '}
            ·{' '}
            {(receipt?.appointment.visitType ?? selection.visitType) === 'first'
              ? 'Primeira consulta'
              : 'Retorno'}
          </dd>
        </div>
        {receipt && (
          <>
            <div>
              <dt className="text-muted-foreground">Paciente</dt>
              <dd>
                {subjects.find(
                  (s) => s.patientId === receipt.appointment.patientId,
                )?.fullName ?? 'Paciente vinculado à sua conta'}
              </dd>
            </div>
            {receipt.appointment.modality === 'onsite' && (
              <div>
                <dt className="text-muted-foreground">Sala atribuída</dt>
                <dd>
                  {receipt.appointment.roomName ??
                    'Confirme a sala na recepção'}
                </dd>
              </div>
            )}
          </>
        )}
      </dl>
      {receipt ? (
        <div ref={notice} tabIndex={-1} className="space-y-4 outline-none">
          {receipt.appointment.status === 'confirmed' ? (
            <SuccessNotice
              title="Consulta confirmada"
              description="O horário foi reservado. Guarde o número do atendimento."
            />
          ) : (
            <p role="status" className="rounded-xl bg-muted p-4 font-semibold">
              Estado atual da consulta:{' '}
              {appointmentStatus[receipt.appointment.status]}
            </p>
          )}
          <p className="break-all text-sm">
            Número do atendimento: {receipt.appointment.id}
          </p>
          <p className="text-sm text-muted-foreground">
            {receipt.notificationState === 'queued'
              ? 'A confirmação está na fila de notificações. Isso não garante a entrega por e-mail.'
              : 'Não foi possível alcançar um canal externo. Consulte o portal e confirme seus contatos com a recepção.'}
          </p>
          {receipt.appointment.modality === 'remote' && (
            <p className="text-sm">
              O preparo e a entrada na videochamada serão disponibilizados em
              uma próxima etapa.
            </p>
          )}
          <Button
            nativeButton={false}
            render={<Link href="/minhas-consultas" />}
          >
            Minhas consultas
          </Button>
          <Button type="button" variant="outline" onClick={onBack}>
            Agendar outro atendimento
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            A seleção não reserva o horário. A disponibilidade será conferida
            novamente na confirmação.
          </p>
          {loading ? (
            <LoadingState label="Conferindo pacientes vinculados…" />
          ) : loadError ? (
            <ErrorState
              title="Não foi possível conferir os pacientes"
              nextStep="Tente novamente antes de confirmar."
              onRetry={() => setReload((v) => v + 1)}
            />
          ) : (
            <div className="max-w-xl space-y-2">
              <label
                htmlFor="booking-patient"
                className="text-sm font-semibold"
              >
                Para quem é a consulta?
              </label>
              <select
                id="booking-patient"
                className={selectClass}
                value={patientId}
                disabled={busy || subjects.length === 0}
                onChange={(event) => {
                  setPatientId(event.target.value)
                  setError(null)
                  setAcknowledged(false)
                }}
              >
                <option value="" disabled>
                  Selecione um paciente vinculado
                </option>
                {subjects.map((subject) => (
                  <option key={subject.patientId} value={subject.patientId}>
                    {subject.fullName}
                    {subject.patientId === user.patientId
                      ? ' (você)'
                      : ' (dependente)'}
                  </option>
                ))}
              </select>
              {subjects.length === 0 && (
                <p role="status" className="text-sm">
                  Cadastre um dependente em Minha conta ou procure a recepção.
                </p>
              )}
            </div>
          )}
          {(user.consentState !== 'active' ||
            error?.code === 'CONSENT_REQUIRED') && (
            <p role="alert" className="text-sm">
              Revise o consentimento vigente em{' '}
              <Link
                href="/minha-conta"
                className="font-semibold text-primary underline"
              >
                Minha conta
              </Link>
              . Para dependente, confira o termo dele antes de tentar novamente.
            </p>
          )}
          {error && (
            <div ref={notice} tabIndex={-1} className="space-y-4 outline-none">
              <ErrorState
                title={
                  duplicate
                    ? 'Outra consulta nesta especialidade'
                    : 'Agendamento não confirmado'
                }
                nextStep={error.message}
              />
              {(error.status === 0 || error.status >= 500) && (
                <p className="text-sm">
                  A resposta pode ter se perdido após a reserva. Confira{' '}
                  <Link
                    href="/minhas-consultas"
                    className="font-semibold text-primary underline"
                  >
                    Minhas consultas
                  </Link>{' '}
                  antes de tentar novamente.
                </p>
              )}
              {duplicate && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  {error.duplicateAppointments.map((item) => (
                    <p key={item.id} className="text-sm">
                      Consulta existente: {format(item.startsAt)}
                    </p>
                  ))}
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-primary"
                      checked={acknowledged}
                      disabled={busy}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />
                    Estou ciente da consulta existente e quero confirmar este
                    novo atendimento.
                  </label>
                </div>
              )}
              {error.code === 'SLOT_UNAVAILABLE' &&
                error.alternatives.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Horários alternativos</h3>
                    <p className="text-sm text-muted-foreground">
                      Selecione e revise antes de confirmar. A disponibilidade
                      será conferida novamente.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {error.alternatives.map((slot) => (
                        <Button
                          type="button"
                          variant="outline"
                          key={`${slot.professionalId}:${slot.startsAt}`}
                          disabled={
                            busy ||
                            (selection.modality === 'onsite' &&
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
            </div>
          )}
          {volatile && (
            <p role="status" className="text-sm text-muted-foreground">
              O navegador bloqueou o armazenamento desta aba. Antes de
              recarregar, confira o agendamento com a recepção para evitar uma
              nova tentativa sem a chave original.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={
                busy ||
                loading ||
                loadError ||
                !patientId ||
                !subjects.some((s) => s.patientId === patientId) ||
                user.consentState !== 'active' ||
                (duplicate && !acknowledged)
              }
              onClick={confirm}
            >
              {busy ? 'Confirmando…' : 'Confirmar agendamento'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onBack}
            >
              Alterar horário
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
