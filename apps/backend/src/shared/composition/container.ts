import 'reflect-metadata'
import { hkdfSync } from 'node:crypto'
import { hashSync } from 'bcryptjs'
import { container, type DependencyContainer } from 'tsyringe'
import type { AccessStore } from '../../application/ports/access-store'
import type { AuditWriter } from '../../application/ports/audit-writer'
import type {
  AccessTokens,
  AuthStore,
} from '../../application/ports/authentication'
import type { ConsentStore } from '../../application/ports/consent'
import type {
  FileAccessPolicy,
  FileDownloadTokens,
  FileRepository,
  FileStorage,
  MalwareScanner,
} from '../../application/ports/files'
import type { MaintenanceStore } from '../../application/ports/maintenance'
import type {
  NotificationChannel,
  NotificationStore,
} from '../../application/ports/notifications'
import type { OpaqueTokens, Passwords } from '../../application/ports/passwords'
import type { PatientRegistrationStore } from '../../application/ports/patient-registration'
import type { ProvisioningStore } from '../../application/ports/provisioning-store'
import type { RecoveryStore } from '../../application/ports/recovery'
import type { SecretBox } from '../../application/ports/secret-box'
import type { SubjectRequestStore } from '../../application/ports/subject-requests'
import { AdministerAccess } from '../../application/use-cases/administer-access'
import { Authenticate } from '../../application/use-cases/authenticate'
import { Authorize } from '../../application/use-cases/authorize'
import { DispatchNotifications } from '../../application/use-cases/dispatch-notifications'
import { ManageConsent } from '../../application/use-cases/manage-consent'
import { ManageFiles } from '../../application/use-cases/manage-files'
import { ManageMaintenance } from '../../application/use-cases/manage-maintenance'
import { ManageSubjectRequests } from '../../application/use-cases/manage-subject-requests'
import { PreparePatientRegistration } from '../../application/use-cases/prepare-patient-registration'
import { ProvisionAccounts } from '../../application/use-cases/provision-accounts'
import { RecoverAccess } from '../../application/use-cases/recover-access'
import type { PrismaClient } from '../../generated/prisma/client'
import { ConsentEvidenceFilePolicy } from '../../infrastructure/files/consent-evidence-policy'
import {
  DevMalwareScanner,
  UnavailableMalwareScanner,
} from '../../infrastructure/files/dev-malware-scanner'
import { LocalEncryptedFileStorage } from '../../infrastructure/files/local-encrypted-file-storage'
import {
  DevEmailSender,
  EmailNotificationChannel,
  PortalNotificationChannel,
} from '../../infrastructure/notifications/channels'
import { PrismaAccessStore } from '../../infrastructure/persistence/prisma/access-store'
import { PrismaAuditWriter } from '../../infrastructure/persistence/prisma/audit-writer'
import { PrismaAuthStore } from '../../infrastructure/persistence/prisma/auth-store'
import { PrismaConsentStore } from '../../infrastructure/persistence/prisma/consent-store'
import { PrismaFileRepository } from '../../infrastructure/persistence/prisma/file-repository'
import { PrismaMaintenanceStore } from '../../infrastructure/persistence/prisma/maintenance-store'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../infrastructure/persistence/prisma/notification-store'
import { PrismaPatientRegistrationStore } from '../../infrastructure/persistence/prisma/patient-registration-store'
import { PrismaProvisioningStore } from '../../infrastructure/persistence/prisma/provisioning-store'
import { PrismaRecoveryStore } from '../../infrastructure/persistence/prisma/recovery-store'
import { PrismaSubjectRequestStore } from '../../infrastructure/persistence/prisma/subject-request-store'
import { JwtAccessTokens } from '../../infrastructure/security/access-tokens'
import { AesSecretBox } from '../../infrastructure/security/aes-secret-box'
import { HmacFileDownloadTokens } from '../../infrastructure/security/file-download-tokens'
import {
  BcryptPasswords,
  CryptoOpaqueTokens,
} from '../../infrastructure/security/passwords'
import { AuthenticatorTotp } from '../../infrastructure/security/totp'
import type { AppConfig } from '../config/environment'

/** Tokens are owned by the composition root. The domain and ports never import TSyringe. */
export const services = {
  config: Symbol('config'),
  database: Symbol('database'),
  audit: Symbol('audit'),
  accessStore: Symbol('accessStore'),
  authorize: Symbol('authorize'),
  administerAccess: Symbol('administerAccess'),
  notificationStore: Symbol('notificationStore'),
  dispatcher: Symbol('dispatcher'),
  provisioningStore: Symbol('provisioningStore'),
  provisionAccounts: Symbol('provisionAccounts'),
  passwords: Symbol('passwords'),
  opaqueTokens: Symbol('opaqueTokens'),
  secretBox: Symbol('secretBox'),
  authStore: Symbol('authStore'),
  accessTokens: Symbol('accessTokens'),
  authenticate: Symbol('authenticate'),
  recoveryStore: Symbol('recoveryStore'),
  recoverAccess: Symbol('recoverAccess'),
  patientRegistrationStore: Symbol('patientRegistrationStore'),
  preparePatientRegistration: Symbol('preparePatientRegistration'),
  fileStorage: Symbol('fileStorage'),
  malwareScanner: Symbol('malwareScanner'),
  fileRepository: Symbol('fileRepository'),
  filePolicy: Symbol('filePolicy'),
  fileTokens: Symbol('fileTokens'),
  manageFiles: Symbol('manageFiles'),
  consentStore: Symbol('consentStore'),
  manageConsent: Symbol('manageConsent'),
  subjectRequestStore: Symbol('subjectRequestStore'),
  manageSubjectRequests: Symbol('manageSubjectRequests'),
  maintenanceStore: Symbol('maintenanceStore'),
  manageMaintenance: Symbol('manageMaintenance'),
} as const

export function createServiceContainer(
  config: AppConfig,
  database: PrismaClient,
): DependencyContainer {
  const scoped = container.createChildContainer()
  scoped.register<AppConfig>(services.config, { useValue: config })
  scoped.register<PrismaClient>(services.database, { useValue: database })
  scoped.register<AuditWriter>(services.audit, {
    useFactory: (scope) =>
      new PrismaAuditWriter(scope.resolve<PrismaClient>(services.database)),
  })
  scoped.register<AccessStore>(services.accessStore, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new PrismaAccessStore(
        scope.resolve<PrismaClient>(services.database),
        {
          internalMinutes: options.internalIdleMinutes,
          patientMinutes: options.patientIdleMinutes,
        },
      )
    },
  })
  scoped.register<Authorize>(services.authorize, {
    useFactory: (scope) =>
      new Authorize(
        scope.resolve<AccessStore>(services.accessStore),
        scope.resolve<AuditWriter>(services.audit),
      ),
  })
  scoped.register<AdministerAccess>(services.administerAccess, {
    useFactory: (scope) =>
      new AdministerAccess(scope.resolve<AccessStore>(services.accessStore)),
  })
  scoped.register<NotificationStore>(services.notificationStore, {
    useFactory: (scope) =>
      new PrismaNotificationStore(
        scope.resolve<PrismaClient>(services.database),
        consentAwareNotificationCheck,
        scope.resolve<SecretBox>(services.secretBox),
      ),
  })
  scoped.register<SecretBox>(services.secretBox, {
    useFactory: (scope) =>
      new AesSecretBox(
        scope.resolve<AppConfig>(services.config).encryptionKey,
        'notification',
      ),
  })
  scoped.register<DispatchNotifications>(services.dispatcher, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      const channels: NotificationChannel[] = [new PortalNotificationChannel()]
      if (options.emailSender === 'dev')
        channels.push(
          new EmailNotificationChannel(
            new DevEmailSender(
              options.emailMailboxPath,
              options.environment,
              options.frontendOrigin,
            ),
          ),
        )
      return new DispatchNotifications(
        scope.resolve<NotificationStore>(services.notificationStore),
        channels,
        scope.resolve<SecretBox>(services.secretBox),
        {
          retrySeconds: options.notificationRetrySeconds,
          maxAttempts: options.notificationMaxAttempts,
        },
      )
    },
  })
  scoped.register<ProvisioningStore>(services.provisioningStore, {
    useFactory: (scope) =>
      new PrismaProvisioningStore(
        scope.resolve<PrismaClient>(services.database),
      ),
  })
  scoped.register<Passwords>(services.passwords, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new BcryptPasswords(
        options.passwordMinLength,
        options.passwordCommonListEnabled,
        options.bcryptRounds,
      )
    },
  })
  scoped.register<OpaqueTokens>(services.opaqueTokens, {
    useFactory: () => new CryptoOpaqueTokens(),
  })
  scoped.register<ProvisionAccounts>(services.provisionAccounts, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new ProvisionAccounts(
        scope.resolve<ProvisioningStore>(services.provisioningStore),
        scope.resolve<Passwords>(services.passwords),
        scope.resolve<OpaqueTokens>(services.opaqueTokens),
        scope.resolve<SecretBox>(services.secretBox),
        options.inviteLinkHours,
        options.accountInactivityReviewDays,
      )
    },
  })
  scoped.register<AuthStore>(services.authStore, {
    useFactory: (scope) =>
      new PrismaAuthStore(scope.resolve<PrismaClient>(services.database)),
  })
  scoped.register<AccessTokens>(services.accessTokens, {
    useFactory: (scope) =>
      new JwtAccessTokens(scope.resolve<AppConfig>(services.config).jwtSecret),
  })
  scoped.register<Authenticate>(services.authenticate, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new Authenticate(
        scope.resolve<AuthStore>(services.authStore),
        scope.resolve<Passwords>(services.passwords),
        scope.resolve<OpaqueTokens>(services.opaqueTokens),
        scope.resolve<AccessTokens>(services.accessTokens),
        new AuthenticatorTotp(),
        new AesSecretBox(options.encryptionKey, 'mfa'),
        {
          accessMinutes: options.accessTokenMinutes,
          refreshDays: options.refreshTokenDays,
          internalIdleMinutes: options.internalIdleMinutes,
          patientIdleMinutes: options.patientIdleMinutes,
          failedLimit: options.failedLoginLimit,
          lockMinutes: options.lockMinutes,
          challengeMinutes: options.mfaChallengeMinutes,
        },
        hashSync('senha-ficticia-do-sistema', options.bcryptRounds),
      )
    },
  })
  scoped.register<RecoveryStore>(services.recoveryStore, {
    useFactory: (scope) =>
      new PrismaRecoveryStore(scope.resolve<PrismaClient>(services.database)),
  })
  scoped.register<RecoverAccess>(services.recoverAccess, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new RecoverAccess(
        scope.resolve<RecoveryStore>(services.recoveryStore),
        scope.resolve<AuthStore>(services.authStore),
        scope.resolve<AuditWriter>(services.audit),
        scope.resolve<Passwords>(services.passwords),
        scope.resolve<OpaqueTokens>(services.opaqueTokens),
        scope.resolve<SecretBox>(services.secretBox),
        {
          resetMinutes: options.resetLinkMinutes,
          verifyHours: options.emailVerifyLinkHours,
          requestsPerHour: options.resetRequestsPerHour,
          historyCount: options.passwordHistoryCount,
        },
      )
    },
  })
  scoped.register<PatientRegistrationStore>(services.patientRegistrationStore, {
    useFactory: (scope) =>
      new PrismaPatientRegistrationStore(
        scope.resolve<PrismaClient>(services.database),
        scope.resolve<SecretBox>(services.secretBox),
      ),
  })
  scoped.register<PreparePatientRegistration>(
    services.preparePatientRegistration,
    {
      useFactory: (scope) =>
        new PreparePatientRegistration(
          scope.resolve<PatientRegistrationStore>(
            services.patientRegistrationStore,
          ),
          scope.resolve<AppConfig>(services.config).patientLegalAdultAgeYears,
        ),
    },
  )
  scoped.register<FileStorage>(services.fileStorage, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new LocalEncryptedFileStorage(
        options.fileStoragePath,
        options.encryptionKey,
      )
    },
  })
  scoped.register<MalwareScanner>(services.malwareScanner, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return options.malwareScanner === 'dev'
        ? new DevMalwareScanner(options.environment)
        : new UnavailableMalwareScanner()
    },
  })
  scoped.register<FileRepository>(services.fileRepository, {
    useFactory: (scope) =>
      new PrismaFileRepository(scope.resolve<PrismaClient>(services.database)),
  })
  scoped.register<FileAccessPolicy>(services.filePolicy, {
    useFactory: (scope) =>
      new ConsentEvidenceFilePolicy(
        scope.resolve<PrismaClient>(services.database),
        scope.resolve<AppConfig>(services.config).environment,
      ),
  })
  scoped.register<FileDownloadTokens>(services.fileTokens, {
    useFactory: (scope) => {
      const key = hkdfSync(
        'sha256',
        scope.resolve<AppConfig>(services.config).encryptionKey,
        Buffer.from('VidaPlena'),
        Buffer.from('file-download-token-v1'),
        32,
      )
      return new HmacFileDownloadTokens(Buffer.from(key))
    },
  })
  scoped.register<ManageFiles>(services.manageFiles, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new ManageFiles(
        scope.resolve<FileStorage>(services.fileStorage),
        scope.resolve<MalwareScanner>(services.malwareScanner),
        scope.resolve<FileRepository>(services.fileRepository),
        scope.resolve<FileAccessPolicy>(services.filePolicy),
        scope.resolve<FileDownloadTokens>(services.fileTokens),
        {
          attachmentMaxMb: options.fileAttachmentMaxMb,
          resultMaxMb: options.fileResultMaxMb,
          recordingMaxMb: options.fileRecordingMaxMb,
          maxPerRecord: options.fileMaxPerRecord,
          signedUrlTtlSeconds: options.fileSignedUrlTtlSeconds,
        },
      )
    },
  })
  scoped.register<ConsentStore>(services.consentStore, {
    useFactory: (scope) =>
      new PrismaConsentStore(scope.resolve<PrismaClient>(services.database)),
  })
  scoped.register<ManageConsent>(services.manageConsent, {
    useFactory: (scope) =>
      new ManageConsent(
        scope.resolve<ConsentStore>(services.consentStore),
        scope.resolve<PatientRegistrationStore>(
          services.patientRegistrationStore,
        ),
        scope.resolve<PreparePatientRegistration>(
          services.preparePatientRegistration,
        ),
        scope.resolve<Passwords>(services.passwords),
        scope.resolve<OpaqueTokens>(services.opaqueTokens),
        scope.resolve<AppConfig>(services.config).inviteLinkHours,
      ),
  })
  scoped.register<SubjectRequestStore>(services.subjectRequestStore, {
    useFactory: (scope) =>
      new PrismaSubjectRequestStore(
        scope.resolve<PrismaClient>(services.database),
        new AesSecretBox(
          scope.resolve<AppConfig>(services.config).encryptionKey,
          'subject-export',
        ),
      ),
  })
  scoped.register<ManageSubjectRequests>(services.manageSubjectRequests, {
    useFactory: (scope) =>
      new ManageSubjectRequests(
        scope.resolve<SubjectRequestStore>(services.subjectRequestStore),
        scope.resolve<AppConfig>(services.config).subjectRequestDays,
      ),
  })
  scoped.register<MaintenanceStore>(services.maintenanceStore, {
    useFactory: (scope) =>
      new PrismaMaintenanceStore(
        scope.resolve<PrismaClient>(services.database),
      ),
  })
  scoped.register<ManageMaintenance>(services.manageMaintenance, {
    useFactory: (scope) => {
      const options = scope.resolve<AppConfig>(services.config)
      return new ManageMaintenance(
        scope.resolve<MaintenanceStore>(services.maintenanceStore),
        options.opsMaintenanceMaxHoursMonth,
        options.opsMaintenanceNoticeHours,
      )
    },
  })
  return scoped
}
