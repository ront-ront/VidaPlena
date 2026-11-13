import { Temporal } from '@js-temporal/polyfill'
export const ABSENCE_LIMIT = 3
export const ABSENCE_WINDOW_MONTHS = 12
export type AbsenceKind = 'unjustified' | 'justified' | 'clinic_fault'
export function absencePenaltyExpiry(occurredAt: Date, timeZone: string) {
  return new Date(
    Temporal.Instant.from(occurredAt.toISOString())
      .toZonedDateTimeISO(timeZone)
      .add({ months: ABSENCE_WINDOW_MONTHS }).epochMilliseconds,
  )
}
export function isNoShowDue(
  status: string,
  startsAt: Date,
  hasCheckIn: boolean,
  now: Date,
  afterMinutes: number,
) {
  return (
    status === 'confirmed' &&
    !hasCheckIn &&
    now.getTime() >= startsAt.getTime() + afterMinutes * 60_000
  )
}
export function suspensionFromOccurrences(expiries: Date[], now: Date) {
  const active = expiries
    .filter((date) => date > now)
    .sort((a, b) => a.getTime() - b.getTime())
  return {
    unjustifiedCount: active.length,
    suspendedUntil:
      active.length >= ABSENCE_LIMIT
        ? active[active.length - ABSENCE_LIMIT]
        : null,
  }
}
