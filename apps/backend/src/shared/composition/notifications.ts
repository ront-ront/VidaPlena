import { DispatchNotifications } from '../../application/use-cases/dispatch-notifications'
import type { PrismaClient } from '../../generated/prisma/client'
import { startNotificationWorker } from '../../infrastructure/jobs/notification-worker'
import {
  DevEmailSender,
  EmailNotificationChannel,
  PortalNotificationChannel,
} from '../../infrastructure/notifications/channels'
import {
  type NotificationConsentCheck,
  PrismaNotificationStore,
} from '../../infrastructure/persistence/prisma/notification-store'
import { AesSecretBox } from '../../infrastructure/security/aes-secret-box'
import type { AppConfig } from '../config/environment'

export function composeNotifications(
  config: AppConfig,
  db: PrismaClient,
  consentCheck?: NotificationConsentCheck,
) {
  const store = new PrismaNotificationStore(db, consentCheck)
  const secrets = new AesSecretBox(config.encryptionKey, 'notification')
  const channels = [
    new PortalNotificationChannel(),
    ...(config.emailSender === 'dev'
      ? [
          new EmailNotificationChannel(
            new DevEmailSender(
              config.emailMailboxPath,
              config.environment,
              config.frontendOrigin,
            ),
          ),
        ]
      : []),
  ]
  const dispatcher = new DispatchNotifications(store, channels, secrets, {
    retrySeconds: config.notificationRetrySeconds,
    maxAttempts: config.notificationMaxAttempts,
  })
  return {
    store,
    dispatcher,
    startWorker: (report: (event: { event: string }) => void) =>
      startNotificationWorker(
        dispatcher,
        config.notificationPollSeconds,
        report,
      ),
  }
}
