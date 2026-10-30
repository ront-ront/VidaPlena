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

export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Array<{ field: string; reason: string }>,
  ) {
    super(code)
    this.name = 'ApplicationError'
  }
}
