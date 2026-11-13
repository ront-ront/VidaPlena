import type { ReminderStore } from '../ports/reminders'

export class ProcessReminders {
  constructor(
    private readonly store: ReminderStore,
    private readonly batchSize: number,
    private readonly now = () => new Date(),
  ) {}
  async runOnce() {
    const now = this.now()
    await this.store.reconcile(now, this.batchSize)
    const ids = await this.store.due(now, this.batchSize)
    for (const id of ids) await this.store.enqueue(id, now)
    return ids.length
  }
}
