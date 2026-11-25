import type { CareLinkTransaction, ClinicalBasis } from './care-links'

export type EmergencyReviewOutcome =
  | 'approved'
  | 'requires_follow_up'
  | 'rejected'
export type EmergencyReview = {
  id: string
  reviewerUserId: string
  outcome: EmergencyReviewOutcome
  notes: string
  reviewedAt: Date
}
export type EmergencyGrant = {
  id: string
  patientId: string
  professionalId: string
  justification: string
  grantedAt: Date
  expiresAt: Date
  review: EmergencyReview | null
}
export type EmergencyQuery = {
  status?: 'pending' | 'reviewed'
  cursor?: string
}
export type ClinicalAuthorization =
  | ClinicalBasis
  | {
      id: string
      patientId: string
      professionalId: string
      expiresAt: Date
      phase: 'emergency'
      source: 'emergency'
    }
export interface EmergencyAccessTransaction extends CareLinkTransaction {
  emergencyGrant(
    input: Omit<EmergencyGrant, 'id' | 'review'>,
  ): Promise<EmergencyGrant>
  emergencyById(id: string): Promise<EmergencyGrant | null>
  activeEmergency(
    professionalId: string,
    patientId: string,
    now: Date,
  ): Promise<EmergencyGrant | null>
  emergencyPage(
    query: EmergencyQuery,
  ): Promise<{ items: EmergencyGrant[]; nextCursor: string | null }>
  lockEmergency(id: string): Promise<void>
  reviewEmergency(
    grantId: string,
    input: Omit<EmergencyReview, 'id'>,
  ): Promise<EmergencyReview>
  notifyEmergency(
    grant: EmergencyGrant,
    requestId: string,
  ): Promise<{ dpoMissing: boolean; count: number }>
}
export interface EmergencyAccessStore {
  transaction<T>(
    run: (tx: EmergencyAccessTransaction) => Promise<T>,
  ): Promise<T>
}
