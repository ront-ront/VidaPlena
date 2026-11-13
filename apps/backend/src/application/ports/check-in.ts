export type CheckInRecord = {
  id: string
  appointmentId: string
  appointmentVersion: number
  arrivedAt: Date
  recordedAt: Date
  recordedBy: string
  lateFlag: boolean
  toleranceMinutes: number
  clinicTimeZone: string
}
