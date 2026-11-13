import { Temporal } from '@js-temporal/polyfill'

export function clinicDate(instant: Date, timeZone: string) {
  return Temporal.Instant.from(instant.toISOString())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString()
}
export function isLateArrival(
  arrivedAt: Date,
  startsAt: Date,
  toleranceMinutes: number,
) {
  return arrivedAt.getTime() - startsAt.getTime() > toleranceMinutes * 60_000
}
