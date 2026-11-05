import { createHash } from 'node:crypto'
import { ApplicationError } from '../errors/application-error'
import type {
  ReservationInput,
  ReservationTransaction,
} from '../ports/reservations'

/** Internal service: the caller authorizes the patient, consent, grade and business operation in this same unit of work. */
export class ReserveSlot {
  constructor(
    private readonly tx: ReservationTransaction,
    private readonly now = () => new Date(),
  ) {}
  async reserve(input: ReservationInput, ignoreId?: string) {
    if (
      !Number.isFinite(input.startsAt.getTime()) ||
      !Number.isFinite(input.endsAt.getTime()) ||
      input.startsAt >= input.endsAt ||
      !input.requestKey ||
      input.requestKey.length > 128 ||
      (input.modality === 'remote' && input.roomId) ||
      (input.state === 'held' &&
        (!input.expiresAt ||
          input.expiresAt <= this.now() ||
          input.appointmentId)) ||
      (input.state === 'confirmed' && (!input.appointmentId || input.expiresAt))
    )
      throw new ApplicationError('VALIDATION_ERROR')
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          input.professionalId,
          input.roomId ?? null,
          input.modality,
          input.startsAt.toISOString(),
          input.endsAt.toISOString(),
          input.state,
          input.appointmentId ?? null,
          input.offerId ?? null,
          input.expiresAt?.toISOString() ?? null,
        ]),
      )
      .digest('hex')
    await this.tx.lockRequest(input.requestKey)
    const previous = await this.tx.byRequest(input.requestKey)
    if (previous) {
      if (previous.requestHash !== hash) throw new ApplicationError('CONFLICT')
      return previous
    }
    await this.tx.lockResources([input.professionalId], [])
    if (!(await this.tx.professionalActive(input.professionalId)))
      throw new ApplicationError('SLOT_UNAVAILABLE')
    const rooms =
      input.modality === 'remote'
        ? [null]
        : input.roomId
          ? [input.roomId]
          : await this.tx.activeRooms()
    for (const roomId of rooms) {
      if (roomId) {
        await this.tx.lockResources([], [roomId])
        if (!(await this.tx.roomActive(roomId))) continue
      }
      await this.tx.expire(
        this.now(),
        [input.professionalId],
        roomId ? [roomId] : [],
      )
      if (
        await this.tx.occupied(
          input.professionalId,
          roomId,
          input.startsAt,
          input.endsAt,
          ignoreId,
        )
      )
        continue
      return this.tx.create(input, roomId, hash)
    }
    throw new ApplicationError('SLOT_UNAVAILABLE')
  }
  async release(id: string) {
    const row = await this.tx.get(id)
    if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    await this.tx.lockResources(
      [row.professionalId],
      row.roomId ? [row.roomId] : [],
    )
    return this.tx.release(id)
  }
  async confirmHold(id: string, appointmentId: string) {
    const row = await this.tx.get(id)
    if (!row) throw new ApplicationError('OFFER_EXPIRED')
    await this.tx.lockResources(
      [row.professionalId],
      row.roomId ? [row.roomId] : [],
    )
    const current = await this.tx.get(id)
    if (
      current?.state === 'confirmed' &&
      current.appointmentId === appointmentId
    )
      return current
    if (
      current?.state !== 'held' ||
      !current.expiresAt ||
      current.expiresAt <= this.now()
    )
      throw new ApplicationError('OFFER_EXPIRED')
    if (
      !(await this.tx.professionalActive(current.professionalId)) ||
      (current.roomId && !(await this.tx.roomActive(current.roomId)))
    )
      throw new ApplicationError('SLOT_UNAVAILABLE')
    return this.tx.confirm(id, appointmentId)
  }
  async replace(id: string, input: ReservationInput) {
    await this.tx.lockRequest(input.requestKey)
    if (await this.tx.byRequest(input.requestKey)) return this.reserve(input)
    const old = await this.tx.get(id)
    if (old?.state !== 'confirmed') throw new ApplicationError('CONFLICT')
    const candidates =
      input.modality === 'onsite'
        ? input.roomId
          ? [input.roomId]
          : await this.tx.activeRooms()
        : []
    await this.tx.lockResources(
      [old.professionalId, input.professionalId],
      [...candidates, ...(old.roomId ? [old.roomId] : [])],
    )
    const previous = await this.tx.byRequest(input.requestKey)
    if (previous) return this.reserve(input)
    const current = await this.tx.get(id)
    if (current?.state !== 'confirmed') throw new ApplicationError('CONFLICT')
    // Both state changes commit together; any validation/constraint/audit failure restores the old reservation.
    await this.tx.release(id)
    return this.reserve(input, id)
  }
}
