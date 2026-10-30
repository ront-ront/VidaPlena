import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type { MaintenanceStore } from '../ports/maintenance'

export class ManageMaintenance {
  constructor(
    private readonly store: MaintenanceStore,
    private readonly maxHoursPerMonth: number,
    private readonly noticeHours: number,
  ) {}
  register(
    actor: Principal,
    startsAt: Date,
    endsAt: Date,
    noticeReference: string,
    context: AuditContext,
  ) {
    if (
      !(endsAt > startsAt) ||
      endsAt.getTime() - startsAt.getTime() > this.maxHoursPerMonth * 3_600_000
    )
      throw new ApplicationError('VALIDATION_ERROR')
    if (startsAt.getTime() - Date.now() < this.noticeHours * 3_600_000)
      throw new ApplicationError('CONFLICT')
    return this.store.register({
      actor,
      startsAt,
      endsAt,
      noticeReference,
      maxHoursPerMonth: this.maxHoursPerMonth,
      noticeHours: this.noticeHours,
      context,
    })
  }
  list() {
    return this.store.list()
  }
}
