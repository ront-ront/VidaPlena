import type { Principal } from '../../domain/rules/access'
import { scheduleBlocked, scheduleContains } from '../../domain/rules/schedule'
import { ApplicationError } from '../errors/application-error'
import type { BookInput, BookingTransaction } from '../ports/booking'
import type { FindAvailability } from './find-availability'

export async function eligibleBookingSlot(
  tx: BookingTransaction,
  input: BookInput,
  portal: boolean,
  now: Date,
  outsideGrade = false,
) {
  const target = await tx.target(input.professionalId, input.specialtyId)
  if (!target?.active || !target.specialtyActive || !target.linked)
    throw new ApplicationError('SLOT_UNAVAILABLE')
  if (
    !target.modalities.includes(input.modality) ||
    !target.specialtyModalities.includes(input.modality) ||
    (input.modality === 'remote' && input.roomId)
  )
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'modality',
        reason:
          'Confira a modalidade permitida para a especialidade e o profissional.',
      },
    ])
  const startsAt = new Date(input.startsAt),
    durationMinutes =
      input.visitType === 'first' ? target.durationFirst : target.durationReturn
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
  if (startsAt < new Date(now.getTime() + (portal ? 2 * 3_600_000 : 0)))
    throw new ApplicationError('BOOKING_LEAD_TIME')
  const withinGrade =
    target.schedule &&
    scheduleContains(
      target.schedule.rules,
      startsAt,
      endsAt,
      input.modality,
      target.schedule.clinicTimeZone,
      durationMinutes,
    )
  if (outsideGrade && withinGrade)
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'startsAt',
        reason:
          'Este horário pertence à grade regular. Use o agendamento normal.',
      },
    ])
  if (
    (!outsideGrade && !withinGrade) ||
    (target.schedule &&
      scheduleBlocked(target.schedule.blocks, startsAt, endsAt))
  )
    throw new ApplicationError('SLOT_UNAVAILABLE')
  return { target, startsAt, endsAt, durationMinutes }
}
export async function bookingAlternatives(
  availability: FindAvailability,
  actor: Principal,
  input: BookInput,
) {
  try {
    const day = availability.localDateOf(input.startsAt)
    const result = await availability.execute(actor, {
      specialtyId: input.specialtyId,
      professionalId: input.professionalId,
      modality: input.modality,
      visitType: input.visitType,
      from: day,
      to: day,
    })
    return result.days
      .flatMap((d) => d.slots)
      .filter(
        (s) =>
          new Date(s.startsAt).getTime() !== new Date(input.startsAt).getTime(),
      )
      .slice(0, 3)
  } catch {
    return []
  }
}
