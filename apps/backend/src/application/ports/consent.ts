import type { Principal } from '../../domain/rules/access'
import type { AuditContext, AuditWriter } from './audit-writer'

export type ConsentAction = 'accept' | 'refuse' | 'revoke'
export interface ConsentInput {
  eventId?: string
  patientId: string
  documentVersionId: string
  action: ConsentAction
  actorUserId: string
  source: 'portal' | 'onsite'
  guardianLinkId?: string | null
  consentingPersonName: string
  consentingRelationship?: string | null
  signedFileId?: string | null
}

export interface ConsentTransaction {
  ownsPatient(userId: string, patientId: string): Promise<boolean>
  patient(
    id: string,
  ): Promise<{ id: string; fullName: string; birthDate: Date } | null>
  guardianLink(
    userId: string,
    patientId: string,
  ): Promise<{ id: string; relationship: string } | null>
  actorName(userId: string): Promise<string | null>
  revokeSessionsForPatient(patientId: string): Promise<void>
  record(
    input: ConsentInput,
  ): Promise<{ id: string; state: 'active' | 'pending' | 'revoked' }>
  audit: AuditWriter
}

export interface ConsentStore {
  current(): Promise<{
    id: string
    version: string
    body: string
    effectiveAt: Date
  } | null>
  publish(input: {
    version: string
    bodyReference: string
    effectiveAt: Date
    actorId: string
    requestId: string
  }): Promise<{ id: string; version: string; effectiveAt: Date }>
  transaction<T>(run: (tx: ConsentTransaction) => Promise<T>): Promise<T>
  history(
    actor: Principal,
    context: AuditContext,
  ): Promise<
    {
      patientId: string
      consentEventId: string
      version: string
      action: ConsentAction
      occurredAt: Date
      source: string
    }[]
  >
}
