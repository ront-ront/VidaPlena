import {
  deliveryPolicy,
  safeNotificationText,
} from '../../domain/rules/notifications'
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationStore,
} from '../ports/notifications'
import type { SecretBox } from '../ports/secret-box'

export interface NotificationPolicy {
  retrySeconds: number
  maxAttempts: number
}
export class DispatchNotifications {
  constructor(
    private readonly store: NotificationStore,
    private readonly channels: NotificationChannel[],
    private readonly secrets: SecretBox,
    private readonly policy: NotificationPolicy,
    private readonly now = () => new Date(),
  ) {}

  enqueue(input: NotificationEvent) {
    const encrypted = input.token
      ? this.secrets.seal(
          input.token,
          `notification:${input.userId}:${input.type}`,
        )
      : null
    return this.store.enqueue(input, encrypted)
  }

  async deliver(id: string) {
    await this.store.withDelivery(id, this.now(), async (tx) => {
      const message = tx.message
      const policyDecision = deliveryPolicy(
        message.category,
        tx.preferences,
        await tx.isAllowed(),
        tx.emailAvailable,
      )
      const decision =
        message.templateKey === 'contact.verification_requested' &&
        tx.emailAvailable
          ? {
              channel: 'email' as const,
              reason: null,
              needsReceptionAttention: false,
            }
          : policyDecision
      const result = {
        deliveryStatus: 'suppressed' as
          | 'sent'
          | 'suppressed'
          | 'retry'
          | 'failed',
        channel: decision.channel,
        preferenceSnapshot: tx.preferences,
        attempts: message.attempts,
        scheduledAt: this.now(),
        failureReasonSafe: decision.reason as string | null,
        needsReceptionAttention: decision.needsReceptionAttention,
        sentAt: undefined as Date | undefined,
      }
      if (decision.channel) {
        result.attempts++
        try {
          const channel = this.channels.find(
            (item) => item.name === decision.channel,
          )
          if (!channel) throw new Error('Canal indisponível.')
          await channel.deliver({
            idempotencyKey: message.id,
            to: tx.email,
            template: message.templateKey,
            text: safeNotificationText(message.templateKey),
            token: message.payloadEncrypted
              ? this.secrets.open(
                  message.payloadEncrypted,
                  `notification:${message.userId}:${message.templateKey}`,
                )
              : undefined,
          })
          result.deliveryStatus = 'sent'
          result.sentAt = this.now()
        } catch {
          result.deliveryStatus =
            result.attempts >= this.policy.maxAttempts ? 'failed' : 'retry'
          result.scheduledAt = new Date(
            this.now().getTime() + this.policy.retrySeconds * 1000,
          )
          result.failureReasonSafe = 'delivery_failed'
          result.needsReceptionAttention = true
        }
      }
      await tx.save(result)
      await tx.audit.append({
        actorRoles: [],
        requestId: message.requestId,
        authorizationBasis: 'notification_policy',
        action: `notification.${result.deliveryStatus}`,
        resourceType: 'Notification',
        resourceId: message.id,
        subjectPatientId: message.patientId ?? undefined,
        metadata: {
          status: result.deliveryStatus,
          category: message.category,
          channel: result.channel,
          count: result.attempts,
          reasonCode: result.failureReasonSafe,
        },
      })
    })
  }

  async runOnce() {
    const ids = await this.store.due(this.now(), 50)
    for (const id of ids) await this.deliver(id)
    return ids.length
  }
}
