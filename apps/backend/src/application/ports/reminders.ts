export interface ReminderStore {
  reconcile(now: Date, limit: number): Promise<number>
  due(now: Date, limit: number): Promise<string[]>
  enqueue(id: string, now: Date): Promise<void>
}
