import type { Principal } from '../../domain/rules/access'
import type { CareAppointment, CarePhase } from '../../domain/rules/care-link'
import type { AuditContext, AuditWriter } from './audit-writer'
export type CareLinkRecord = {
  id: string
  patientId: string
  professionalId: string
  source: 'appointment' | 'shared_case' | 'substitution'
  sourceAppointmentId: string | null
  parentLinkId: string | null
  startsAt: Date
  endsAt: Date
  status: string
  appointment: CareAppointment | null
  parent?: CareLinkRecord | null
}
export type ClinicalBasis = {
  id: string
  professionalId: string
  patientId: string
  phase: CarePhase
  expiresAt: Date
  source: CareLinkRecord['source']
}
export type CareLinkQuery = {
  patientId?: string
  status?: 'active' | 'scheduled' | 'expired' | 'revoked'
  cursor?: string
}
export interface CareLinkTransaction {
  principal(actor: Principal): Promise<Principal | null>
  professional(actor: Principal): Promise<{ id: string } | null>
  target(professionalId: string): Promise<boolean>
  patientExists(patientId: string): Promise<boolean>
  lock(patientId: string): Promise<void>
  page(
    professionalId: string,
    query: CareLinkQuery,
    now: Date,
  ): Promise<{ items: CareLinkRecord[]; nextCursor: string | null }>
  links(professionalId: string, patientId: string): Promise<CareLinkRecord[]>
  grant(input: {
    patientId: string
    professionalId: string
    source: 'shared_case' | 'substitution'
    parentLinkId: string | null
    startsAt: Date
    endsAt: Date
    reason: string
    grantedBy: string
  }): Promise<CareLinkRecord>
  audit: AuditWriter
}
export interface CareLinkStore {
  transaction<T>(run: (tx: CareLinkTransaction) => Promise<T>): Promise<T>
  reconcile(context: AuditContext): Promise<{ count: number }>
}
