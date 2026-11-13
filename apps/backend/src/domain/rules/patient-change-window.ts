// RN-004 do DRS: limite inclusivo de quatro horas para autoalteração.
export function patientChangeDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - 4 * 3_600_000)
}
export function isPatientChangeLate(startsAt: Date, now: Date): boolean {
  return now > patientChangeDeadline(startsAt)
}
