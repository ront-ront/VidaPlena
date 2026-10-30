import type { Principal } from '../../domain/rules/access'
import type { AuditContext } from './audit-writer'

export type SubjectRequestKind = 'access' | 'correction' | 'export' | 'erasure'
export type SubjectDecision = 'approved' | 'denied' | 'retained' | 'referred'

export interface SubjectRequestStore {
  create(input: {
    actor: Principal
    patientId: string
    kind: SubjectRequestKind
    description?: string
    dueAt: Date
    context: AuditContext
  }): Promise<unknown>
  own(
    actor: Principal,
    context: AuditContext,
    cursor?: string,
  ): Promise<unknown>
  queue(
    actor: Principal,
    input: { status?: 'open' | 'resolved'; overdue?: boolean; cursor?: string },
    context: AuditContext,
  ): Promise<unknown>
  consentMetadata(
    actor: Principal,
    input: {
      patientId?: string
      action?: 'accept' | 'refuse' | 'revoke'
      from?: Date
      to?: Date
      cursor?: string
    },
    context: AuditContext,
  ): Promise<unknown>
  resolve(
    actor: Principal,
    id: string,
    decision: SubjectDecision,
    explanation: string,
    context: AuditContext,
  ): Promise<unknown>
  exportFor(
    actor: Principal,
    id: string,
    context: AuditContext,
  ): Promise<string>
}
