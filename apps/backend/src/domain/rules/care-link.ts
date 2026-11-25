import { Temporal } from '@js-temporal/polyfill'
export type CareLinkPolicy = {
  preHours: number
  postDays: number
  noShowDays: number
  sharedCaseEnabled: boolean
  timeZone: string
}
export type CareAppointment = {
  id: string
  patientId: string
  professionalId: string
  startsAt: Date
  endsAt: Date
  status: string
  version: number
}
export type CarePhase = 'pre' | 'during' | 'post'
export function careWindow(
  appointment: CareAppointment,
  policy: CareLinkPolicy,
) {
  if (appointment.status === 'cancelled') return null
  const start = Temporal.Instant.from(
    appointment.startsAt.toISOString(),
  ).toZonedDateTimeISO(policy.timeZone)
  const end = Temporal.Instant.from(
    appointment.endsAt.toISOString(),
  ).toZonedDateTimeISO(policy.timeZone)
  return {
    startsAt: new Date(
      Number(start.subtract({ hours: policy.preHours }).epochMilliseconds),
    ),
    endsAt: new Date(
      Number(
        (appointment.status === 'no_show'
          ? start.add({ days: policy.noShowDays })
          : end.add({ days: policy.postDays })
        ).epochMilliseconds,
      ),
    ),
  }
}
export function carePhase(
  appointment: CareAppointment,
  policy: CareLinkPolicy,
  now: Date,
): CarePhase | null {
  const window = careWindow(appointment, policy)
  if (!window || now < window.startsAt || now >= window.endsAt) return null
  if (appointment.status === 'completed' || appointment.status === 'no_show')
    return 'post'
  if (now < appointment.startsAt) return 'pre'
  return now < appointment.endsAt ? 'during' : 'post'
}
