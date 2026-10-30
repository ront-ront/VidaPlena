import type { Principal } from '../../domain/rules/access'
import type { AuditContext } from '../ports/audit-writer'
import type {
  SubjectDecision,
  SubjectRequestKind,
  SubjectRequestStore,
} from '../ports/subject-requests'

export class ManageSubjectRequests {
  constructor(
    private readonly store: SubjectRequestStore,
    private readonly dueDays: number,
  ) {}
  create(
    actor: Principal,
    patientId: string,
    kind: SubjectRequestKind,
    description: string | undefined,
    context: AuditContext,
  ) {
    const dueAt = new Date(Date.now() + this.dueDays * 86_400_000)
    return this.store.create({
      actor,
      patientId,
      kind,
      description,
      dueAt,
      context,
    })
  }
  own(actor: Principal, context: AuditContext, cursor?: string) {
    return this.store.own(actor, context, cursor)
  }
  queue(
    actor: Principal,
    input: { status?: 'open' | 'resolved'; overdue?: boolean; cursor?: string },
    context: AuditContext,
  ) {
    return this.store.queue(actor, input, context)
  }
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
  ) {
    return this.store.consentMetadata(actor, input, context)
  }
  resolve(
    actor: Principal,
    id: string,
    decision: SubjectDecision,
    explanation: string,
    context: AuditContext,
  ) {
    return this.store.resolve(actor, id, decision, explanation, context)
  }
  exportFor(actor: Principal, id: string, context: AuditContext) {
    return this.store.exportFor(actor, id, context)
  }
}
