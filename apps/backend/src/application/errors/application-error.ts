export type ErrorCode =
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_EXPIRED'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND_OR_FORBIDDEN'
  | 'CONFLICT'
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNPROCESSABLE_FILE'
  | 'SCHEDULE_IMPACT_REVIEW'
  | 'SLOT_UNAVAILABLE'
  | 'OFFER_EXPIRED'
  | 'DUPLICATE_SPECIALTY_WARNING'
  | 'AUTO_BOOKING_SUSPENDED'
  | 'BOOKING_LEAD_TIME'
  | 'BOOKING_CHANGE_WINDOW'

export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Array<{ field: string; reason: string }>,
    readonly context?: {
      affectedAppointments?: Array<{
        id: string
        startsAt: string
        endsAt: string
      }>
      duplicateAppointments?: Array<{ id: string; startsAt: string }>
      alternatives?: Array<{
        startsAt: string
        endsAt: string
        professionalId: string
        roomAvailable: boolean
      }>
    },
  ) {
    super(code)
    this.name = 'ApplicationError'
  }
}
