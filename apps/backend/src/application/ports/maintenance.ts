import type { Principal } from '../../domain/rules/access'
import type { AuditContext } from './audit-writer'

export interface MaintenanceStore {
  register(input: {
    actor: Principal
    startsAt: Date
    endsAt: Date
    noticeReference: string
    maxHoursPerMonth: number
    noticeHours: number
    context: AuditContext
  }): Promise<unknown>
  list(): Promise<unknown>
}
