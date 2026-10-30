import type { Principal } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'
import type { ConsentInput } from './consent'

export interface PreparedPatient {
  fullName: string
  birthDate: Date
  cpf: string
  phone: string | null
  email: string | null
  minor: boolean
}

export interface PatientRegistrationTransaction {
  principal(proof: {
    userId: string
    sessionId: string
  }): Promise<Principal | null>
  guardian(userId: string): Promise<{ id: string; active: boolean } | null>
  guardianConsentActive(userId: string): Promise<boolean>
  guardianName(userId: string): Promise<string | null>
  createSelf(
    patient: PreparedPatient,
    passwordHash: string,
  ): Promise<{
    patientId: string
    accountId: string
  }>
  createDependent(
    patient: PreparedPatient,
    guardianUserId: string,
    relationship: string,
  ): Promise<{ patientId: string; guardianLinkId: string }>
  createOnsite(
    patient: PreparedPatient,
    actorId: string,
    guardianUserId?: string,
    relationship?: string,
    invitation?: {
      tokenHash: string
      expiresAt: Date
      token: string
      requestId: string
    },
  ): Promise<{
    patientId: string
    accountId: string | null
    guardianLinkId: string | null
  }>
  recordConsent(
    input: ConsentInput,
  ): Promise<{ id: string; state: 'active' | 'pending' | 'revoked' }>
  audit: AuditWriter
}

export interface PatientRegistrationStore {
  transaction<T>(
    run: (tx: PatientRegistrationTransaction) => Promise<T>,
  ): Promise<T>
  dependents(userId: string): Promise<
    {
      patientId: string
      fullName: string
      relationship: string
      status: string
    }[]
  >
}
