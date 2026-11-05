import { Temporal } from '@js-temporal/polyfill'
import { localInstant } from './schedule'

export type TimePreference = {
  weekdays: number[]
  localStart: string
  localEnd: string
}

export function normalizePreferences(preferences: TimePreference[]) {
  const unique = new Map(
    preferences.map((p) => {
      const value = {
        weekdays: [...new Set(p.weekdays)].sort((a, b) => a - b),
        localStart: p.localStart,
        localEnd: p.localEnd,
      }
      return [JSON.stringify(value), value] as const
    }),
  )
  return [...unique.values()].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )
}
export function matchesWaitlist(
  entry: {
    dateFrom: string
    dateTo: string
    timePreferences: TimePreference[]
  },
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
) {
  const local = Temporal.Instant.from(
      startsAt.toISOString(),
    ).toZonedDateTimeISO(timeZone),
    date = local.toPlainDate().toString()
  if (date < entry.dateFrom || date > entry.dateTo) return false
  return entry.timePreferences.some((p) => {
    if (!p.weekdays.includes(local.dayOfWeek)) return false
    try {
      return (
        startsAt >= localInstant(date, p.localStart, timeZone) &&
        endsAt <= localInstant(date, p.localEnd, timeZone)
      )
    } catch {
      return false
    }
  })
}
