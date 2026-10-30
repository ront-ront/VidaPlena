import type {
  DeliveryChannel,
  NotificationCategory,
  NotificationPreferences,
  NotificationTemplate,
} from '../../domain/rules/notifications'
import type { AuditContext, AuditWriter } from './audit-writer'

export interface NotificationEvent {
  type: NotificationTemplate
  aggregateId: string
  version: number
  userId: string
  patientId?: string
  requestId: string
  token?: string
}
export interface NotificationMessage {
  id: string
  userId: string
  patientId: string | null
  templateKey: NotificationTemplate
  category: NotificationCategory
  payloadEncrypted: string | null
  requestId: string
  attempts: number
}
export interface Delivery {
  idempotencyKey: string
  to: string
  template: NotificationTemplate
  text: string
  token?: string
}
export interface NotificationChannel {
  readonly name: string
  deliver(message: Delivery): Promise<void>
}
export interface EmailSender {
  send(message: Delivery): Promise<void>
}
export interface DeliveryResult {
  deliveryStatus: 'sent' | 'suppressed' | 'retry' | 'failed'
  channel: DeliveryChannel | null
  preferenceSnapshot: NotificationPreferences
  attempts: number
  scheduledAt: Date
  sentAt?: Date
  failureReasonSafe: string | null
  needsReceptionAttention: boolean
}
export interface NotificationDeliveryTransaction {
  message: NotificationMessage
  preferences: NotificationPreferences
  email: string
  emailAvailable: boolean
  isAllowed(): Promise<boolean>
  save(result: DeliveryResult): Promise<void>
  audit: AuditWriter
}
export interface NotificationStore {
  enqueue(input: NotificationEvent, encrypted: string | null): Promise<string>
  due(now: Date, limit: number): Promise<string[]>
  withDelivery(
    id: string,
    now: Date,
    run: (tx: NotificationDeliveryTransaction) => Promise<void>,
  ): Promise<void>
  preferences(userId: string): Promise<NotificationPreferences>
  updatePreferences(
    userId: string,
    value: NotificationPreferences,
    context: AuditContext,
  ): Promise<void>
  list(
    userId: string,
    cursor?: string,
  ): Promise<{ items: object[]; nextCursor: string | null }>
  attention(
    cursor?: string,
  ): Promise<{ items: object[]; nextCursor: string | null }>
}
