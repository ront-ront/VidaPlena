import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type { BookingStore, RoomOptionsInput } from '../ports/booking'
import { eligibleBookingSlot } from './booking-policy'
export class FindRoomOptions {
  constructor(
    private readonly store: BookingStore,
    private readonly audit: AuditWriter,
    private readonly timeZone: string,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: Principal,
    input: RoomOptionsInput,
    context: AuditContext,
    fitIn = false,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        await tx.lock(`room-options:${context.requestId}`, actor.userId)
        const current = await tx.principal(actor)
        if (
          !current ||
          (fitIn
            ? !mayAccess(current, 'create_fit_in')
            : !current.roles.some(
                (role) => role === 'receptionist' || role === 'admin',
              ))
        )
          throw new ApplicationError('FORBIDDEN')
        if (fitIn && input.appointmentId)
          throw new ApplicationError('VALIDATION_ERROR')
        let subjectPatientId: string | undefined
        if (input.appointmentId) {
          const original = await tx.appointment(input.appointmentId)
          if (!original) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
          if (
            original.version !== input.expectedVersion ||
            !['confirmed', 'waiting'].includes(original.status)
          )
            throw new ApplicationError('CONFLICT')
          subjectPatientId = original.patientId
          if (
            original.specialtyId !== input.specialtyId ||
            original.visitType !== input.visitType
          )
            throw new ApplicationError('VALIDATION_ERROR')
        }
        const now = this.now(),
          slot = await eligibleBookingSlot(
            tx,
            { ...input, modality: 'onsite' },
            false,
            now,
            fitIn,
          )
        const items = await tx.freeRooms(
          input.professionalId,
          slot.startsAt,
          slot.endsAt,
          now,
          input.appointmentId,
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: fitIn
            ? 'appointment.fit_in_room_options_read'
            : 'appointment.room_options_read',
          subjectPatientId,
          resourceType: input.appointmentId
            ? 'Appointment'
            : 'ProfessionalProfile',
          resourceId: input.appointmentId ?? input.professionalId,
          metadata: { count: items.length },
        })
        return {
          items,
          suggestedRoomId: items[0]?.id ?? null,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          clinicTimeZone: this.timeZone,
        }
      })
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'authorization.denied',
          resourceType: 'ProfessionalProfile',
          resourceId: input.professionalId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
