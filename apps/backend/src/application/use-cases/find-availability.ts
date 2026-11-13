import { Temporal } from '@js-temporal/polyfill'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { civilWindow, localInstant } from '../../domain/rules/schedule'
import { ApplicationError } from '../errors/application-error'
import type {
  AvailabilityQuery,
  AvailabilityStore,
  OccupiedInterval,
} from '../ports/availability'

export const overlaps = (a: Date, b: Date, c: Date, d: Date) => a < d && c < b
export function roomFree(
  roomId: string,
  startsAt: Date,
  endsAt: Date,
  occupied: OccupiedInterval[],
) {
  return !occupied.some(
    (r) =>
      r.roomId === roomId && overlaps(startsAt, endsAt, r.startsAt, r.endsAt),
  )
}
export class FindAvailability {
  constructor(
    private readonly store: AvailabilityStore,
    private readonly timeZone: string,
    private readonly maxWindowDays: number,
    private readonly lookaheadDays: number,
    private readonly now = () => new Date(),
  ) {}
  context(actor: Principal) {
    if (!mayAccess(actor, 'session')) throw new ApplicationError('FORBIDDEN')
    const serverNow = this.now().toISOString()
    return {
      clinicTimeZone: this.timeZone,
      serverNow,
      localDate: this.localDateOf(serverNow),
    }
  }
  withStore(store: AvailabilityStore, now = this.now) {
    return new FindAvailability(
      store,
      this.timeZone,
      this.maxWindowDays,
      this.lookaheadDays,
      now,
    )
  }
  localDateOf(instant: string) {
    return Temporal.Instant.from(instant)
      .toZonedDateTimeISO(this.timeZone)
      .toPlainDate()
      .toString()
  }
  async execute(actor: Principal, query: AvailabilityQuery) {
    if (!mayAccess(actor, 'session')) throw new ApplicationError('FORBIDDEN')
    const now = this.now()
    let from: Temporal.PlainDate,
      to: Temporal.PlainDate,
      last: Temporal.PlainDate
    try {
      from = Temporal.PlainDate.from(query.from)
      to = Temporal.PlainDate.from(query.to)
      civilWindow(query.from, query.to, this.timeZone, this.maxWindowDays)
      last = to.add({ days: this.lookaheadDays })
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'from',
          reason: 'Confira as datas e o limite configurado da busca.',
        },
      ])
    }
    const range = civilWindow(
      from.toString(),
      last.toString(),
      this.timeZone,
      this.maxWindowDays + this.lookaheadDays,
    )
    const data = await this.store.load(query, range.startsAt, range.endsAt, now)
    if (!data.specialty) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (!data.specialty.modalities.includes(query.modality))
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'modality',
          reason: 'Modalidade não disponível para esta especialidade.',
        },
      ])
    const duration = data.specialty[query.visitType]
    const earliest = new Date(
      now.getTime() + (actor.roles.includes('patient') ? 2 * 3_600_000 : 0),
    )
    const days: {
      localDate: string
      slots: {
        startsAt: string
        endsAt: string
        professionalId: string
        roomAvailable: boolean
      }[]
    }[] = []
    let nearestAvailableAt: string | null = null
    for (
      let day = from;
      Temporal.PlainDate.compare(day, last) <= 0;
      day = day.add({ days: 1 })
    ) {
      const localDate = day.toString()
      const slots: {
        startsAt: string
        endsAt: string
        professionalId: string
        roomAvailable: boolean
      }[] = []
      for (const professional of data.professionals) {
        if (
          !professional.modalities.includes(query.modality) ||
          !professional.schedule
        )
          continue
        for (const rule of professional.schedule.rules) {
          if (
            rule.weekday !== day.dayOfWeek ||
            rule.modality !== query.modality ||
            rule.effectiveFrom > localDate ||
            (rule.effectiveTo && rule.effectiveTo < localDate)
          )
            continue
          let ruleEnd: Date
          try {
            ruleEnd = localInstant(
              localDate,
              rule.localEnd,
              professional.schedule.clinicTimeZone,
            )
          } catch {
            continue
          }
          const [hour, minute] = rule.localStart.split(':').map(Number)
          const [endHour, endMinute] = rule.localEnd.split(':').map(Number)
          for (
            let at = hour * 60 + minute;
            at + duration <= endHour * 60 + endMinute;
            at += duration
          ) {
            let startsAt: Date
            try {
              startsAt = localInstant(
                localDate,
                `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`,
                professional.schedule.clinicTimeZone,
              )
            } catch {
              continue
            }
            const endsAt = new Date(startsAt.getTime() + duration * 60_000)
            if (startsAt < earliest || endsAt > ruleEnd) continue
            if (
              professional.schedule.blocks.some((b) =>
                overlaps(
                  startsAt,
                  endsAt,
                  new Date(b.startsAt),
                  new Date(b.endsAt),
                ),
              )
            )
              continue
            if (
              data.occupied.some(
                (r) =>
                  r.professionalId === professional.id &&
                  overlaps(startsAt, endsAt, r.startsAt, r.endsAt),
              )
            )
              continue
            const roomAvailable =
              query.modality === 'remote' ||
              data.roomIds.some((id) =>
                roomFree(id, startsAt, endsAt, data.occupied),
              )
            if (!roomAvailable) continue
            slots.push({
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              professionalId: professional.id,
              roomAvailable,
            })
          }
        }
      }
      slots.sort(
        (a, b) =>
          a.startsAt.localeCompare(b.startsAt) ||
          a.professionalId.localeCompare(b.professionalId),
      )
      if (slots.length) {
        if (!nearestAvailableAt) nearestAvailableAt = slots[0].startsAt
        if (Temporal.PlainDate.compare(day, to) <= 0)
          days.push({ localDate, slots })
        else break
      }
      if (Temporal.PlainDate.compare(day, to) >= 0 && days.length) break
    }
    return { days, nearestAvailableAt, clinicTimeZone: this.timeZone }
  }
}
