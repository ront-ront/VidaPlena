import { Router } from 'express'
import type { AccessStore } from '../../application/ports/access-store'
import type { AuditWriter } from '../../application/ports/audit-writer'
import type {
  AccessTokens,
  AuthStore,
} from '../../application/ports/authentication'
import type { NotificationStore } from '../../application/ports/notifications'
import type { PatientRegistrationStore } from '../../application/ports/patient-registration'
import type { ProvisioningStore } from '../../application/ports/provisioning-store'
import type { AdministerAccess } from '../../application/use-cases/administer-access'
import type { Authenticate } from '../../application/use-cases/authenticate'
import type { Authorize } from '../../application/use-cases/authorize'
import type { ManageConsent } from '../../application/use-cases/manage-consent'
import type { ManageFiles } from '../../application/use-cases/manage-files'
import type { ManageMaintenance } from '../../application/use-cases/manage-maintenance'
import type { ManageSubjectRequests } from '../../application/use-cases/manage-subject-requests'
import type { ProvisionAccounts } from '../../application/use-cases/provision-accounts'
import type { RecoverAccess } from '../../application/use-cases/recover-access'
import { ConsentEvidenceReconciler } from '../../infrastructure/jobs/consent-evidence-reconciler'
import { OperationalTelemetry } from '../../infrastructure/observability/operational-telemetry'
import { createPrismaClient } from '../../infrastructure/persistence/prisma/client'
import type { AppConfig } from '../config/environment'
import { createAccessRouter } from '../infra/http/access-router'
import { createApp } from '../infra/http/app'
import { createAuthRouter } from '../infra/http/auth-router'
import { createConsentRouter } from '../infra/http/consent-router'
import { maintenanceBody } from '../infra/http/contracts/maintenance'
import { createFileRouter } from '../infra/http/file-router'
import {
  accessGuard,
  auditContext,
  principalOf,
} from '../infra/http/middleware/access'
import { createNotificationRouter } from '../infra/http/notification-router'
import { registerApiDocumentation } from '../infra/http/openapi'
import { parseInput } from '../infra/http/parse-input'
import { createPatientRouter } from '../infra/http/patient-router'
import { createProvisioningRouter } from '../infra/http/provisioning-router'
import { createRecoveryRouter } from '../infra/http/recovery-router'
import { createSubjectRequestRouter } from '../infra/http/subject-request-router'
import { createServiceContainer, services } from './container'

export interface ManagedResource {
  close(): Promise<void>
}

export function composeApplication(
  config: AppConfig,
  resources: ManagedResource[] = [],
  routes?: Router,
  telemetry?: OperationalTelemetry,
  readinessCheck?: () => Promise<boolean>,
) {
  return {
    app: createApp(
      config,
      routes,
      telemetry?.unexpectedError.bind(telemetry),
      telemetry,
      readinessCheck,
    ),
    async close() {
      const results = await Promise.allSettled(
        resources.map((resource) => resource.close()),
      )
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Falha ao encerrar recursos da aplicação.')
    },
  }
}

export async function composeBackendApplication(config: AppConfig) {
  const db = createPrismaClient(config.databaseUrl)
  try {
    await db.$connect()
    const scope = createServiceContainer(config, db)
    const tokens = scope.resolve<AccessTokens>(services.accessTokens)
    const authorize = scope.resolve<Authorize>(services.authorize)
    const accessStore = scope.resolve<AccessStore>(services.accessStore)
    const authStore = scope.resolve<AuthStore>(services.authStore)
    const telemetry = OperationalTelemetry.create({
      slowRequestMs: config.opsSlowRequestMs,
      alertsEnabled: config.opsAlertsEnabled,
      logLevel: config.opsLogLevel,
    })
    const routes = Router()
    registerApiDocumentation(routes)
    const maintenance = scope.resolve<ManageMaintenance>(
      services.manageMaintenance,
    )
    const adminGuard = accessGuard(tokens, authorize, 'admin_users')
    routes.post(
      '/admin/ops/maintenance-windows',
      adminGuard,
      async (req, res) => {
        const input = parseInput(maintenanceBody, req.body)
        res
          .status(201)
          .json(
            await maintenance.register(
              principalOf(res),
              new Date(input.startsAt),
              new Date(input.endsAt),
              input.noticeReference,
              auditContext(req, res),
            ),
          )
      },
    )
    routes.get(
      '/admin/ops/maintenance-windows',
      adminGuard,
      async (_req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        res.json(await maintenance.list())
      },
    )
    routes.get(
      '/admin/ops/metrics',
      accessGuard(tokens, authorize, 'admin_users'),
      async (_req, res) => {
        telemetry.setNotificationBacklog(
          await db.notification.count({
            where: { deliveryStatus: { in: ['queued', 'retry'] } },
          }),
        )
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Type', telemetry.contentType())
        res.send(await telemetry.metrics())
      },
    )
    routes.use(
      createAuthRouter(
        config,
        scope.resolve<Authenticate>(services.authenticate),
        authStore,
        tokens,
        authorize,
        scope.resolve<AuditWriter>(services.audit),
      ),
    )
    routes.use(
      createProvisioningRouter(
        tokens,
        authorize,
        scope.resolve<ProvisionAccounts>(services.provisionAccounts),
        scope.resolve<ProvisioningStore>(services.provisioningStore),
        accessStore,
      ),
    )
    routes.use(
      createRecoveryRouter(
        tokens,
        authorize,
        scope.resolve<RecoverAccess>(services.recoverAccess),
      ),
    )
    routes.use(
      createAccessRouter(
        tokens,
        authorize,
        scope.resolve<AdministerAccess>(services.administerAccess),
        accessStore,
      ),
    )
    routes.use(
      createNotificationRouter(
        tokens,
        authorize,
        scope.resolve<NotificationStore>(services.notificationStore),
      ),
    )
    routes.use(
      createPatientRouter(
        tokens,
        authorize,
        scope.resolve<PatientRegistrationStore>(
          services.patientRegistrationStore,
        ),
        scope.resolve<AuditWriter>(services.audit),
      ),
    )
    routes.use(
      createFileRouter(
        tokens,
        authorize,
        scope.resolve<ManageFiles>(services.manageFiles),
      ),
    )
    routes.use(
      createConsentRouter(
        config,
        tokens,
        authorize,
        authStore,
        scope.resolve<ManageConsent>(services.manageConsent),
        scope.resolve<ManageFiles>(services.manageFiles),
        config.fileAttachmentMaxMb * 1024 * 1024,
      ),
    )
    routes.use(
      createSubjectRequestRouter(
        tokens,
        authorize,
        scope.resolve<ManageSubjectRequests>(services.manageSubjectRequests),
      ),
    )
    const reconciler = new ConsentEvidenceReconciler(
      db,
      scope.resolve<ManageFiles>(services.manageFiles),
      config.fileOrphanReconcileMinutes,
    )
    try {
      const count = await reconciler.runOnce()
      telemetry.jobResult('consent_evidence_reconcile', 'succeeded', count)
    } catch (error) {
      telemetry.jobResult('consent_evidence_reconcile', 'failed', 0)
      throw error
    }
    const timer = setInterval(() => {
      void reconciler.runOnce().then(
        (count) =>
          telemetry.jobResult('consent_evidence_reconcile', 'succeeded', count),
        () => telemetry.jobResult('consent_evidence_reconcile', 'failed', 0),
      )
    }, 15 * 60_000)
    timer.unref()
    return composeApplication(
      config,
      [
        { close: async () => clearInterval(timer) },
        { close: () => db.$disconnect() },
      ],
      routes,
      telemetry,
      async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            db.$queryRaw`SELECT 1`.then(() => true),
            new Promise<boolean>((resolve) => {
              timeout = setTimeout(
                () => resolve(false),
                config.opsReadinessTimeoutMs,
              )
            }),
          ])
        } finally {
          if (timeout) clearTimeout(timeout)
        }
      },
    )
  } catch (error) {
    await db.$disconnect()
    throw error
  }
}
