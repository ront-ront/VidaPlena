import { ApplicationError } from '../../../application/errors/application-error'
import type {
  PatientRegistrationStore,
  PatientRegistrationTransaction,
} from '../../../application/ports/patient-registration'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'
import { userDataConsentState } from './consent-state'
import { recordConsentEvent } from './consent-store'
import { enqueueNotification } from './notification-store'

export class PrismaPatientRegistrationStore
  implements PatientRegistrationStore
{
  constructor(
    private readonly db: PrismaClient,
    private readonly secrets: SecretBox,
  ) {}

  async transaction<T>(
    run: (tx: PatientRegistrationTransaction) => Promise<T>,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
          const adapter: PatientRegistrationTransaction = {
            principal: (proof) =>
              readPrincipal(tx, proof.userId, proof.sessionId),
            guardian: async (userId) => {
              const user = await tx.user.findUnique({
                where: { id: userId },
                include: { roles: { where: { revokedAt: null } } },
              })
              return user
                ? {
                    id: user.id,
                    active:
                      user.status === 'active' &&
                      user.roles.some((role) => role.roleCode === 'patient'),
                  }
                : null
            },
            guardianConsentActive: async (userId) =>
              (await userDataConsentState(tx, userId)) === 'active',
            guardianName: async (userId) =>
              (
                await tx.user.findUnique({
                  where: { id: userId },
                  select: { fullName: true },
                })
              )?.fullName ?? null,
            createSelf: async (patient, passwordHash) => {
              if (patient.minor || !patient.email || !patient.phone)
                throw new ApplicationError('VALIDATION_ERROR')
              const user = await tx.user.create({
                data: {
                  email: patient.email,
                  phone: patient.phone,
                  fullName: patient.fullName,
                  passwordHash,
                  status: 'active',
                  roles: { create: { roleCode: 'patient' } },
                  passwordHistory: { create: { passwordHash } },
                  patient: {
                    create: {
                      fullName: patient.fullName,
                      birthDate: patient.birthDate,
                      cpf: patient.cpf,
                      phone: patient.phone,
                      email: patient.email,
                    },
                  },
                },
                include: { patient: true },
              })
              if (!user.patient) throw new Error('Perfil de paciente ausente.')
              return { patientId: user.patient.id, accountId: user.id }
            },
            createDependent: async (patient, guardianUserId, relationship) => {
              const guardian = await tx.user.findUnique({
                where: { id: guardianUserId },
                include: { roles: { where: { revokedAt: null } } },
              })
              if (
                guardian?.status !== 'active' ||
                !guardian.roles.some((role) => role.roleCode === 'patient') ||
                !relationship.trim()
              )
                throw new ApplicationError('VALIDATION_ERROR')
              const created = await tx.patientProfile.create({
                data: {
                  fullName: patient.fullName,
                  birthDate: patient.birthDate,
                  cpf: patient.cpf,
                  phone: patient.phone,
                  email: patient.email,
                  guardians: {
                    create: { guardianUserId, relationship },
                  },
                },
                include: { guardians: true },
              })
              return {
                patientId: created.id,
                guardianLinkId: created.guardians[0].id,
              }
            },
            createOnsite: async (
              patient,
              actorId,
              guardianUserId,
              relationship,
              invitation,
            ) => {
              if (patient.minor && (!guardianUserId || !relationship?.trim()))
                throw new ApplicationError('VALIDATION_ERROR')
              if (guardianUserId && !relationship?.trim())
                throw new ApplicationError('VALIDATION_ERROR')
              if (guardianUserId) {
                const guardian = await tx.user.findUnique({
                  where: { id: guardianUserId },
                  include: { roles: { where: { revokedAt: null } } },
                })
                if (
                  guardian?.status !== 'active' ||
                  !guardian.roles.some((role) => role.roleCode === 'patient')
                )
                  throw new ApplicationError('VALIDATION_ERROR')
              }
              if (patient.email && !guardianUserId && !invitation)
                throw new ApplicationError('VALIDATION_ERROR')
              let accountId: string | null = null
              if (patient.email && !guardianUserId) {
                const user = await tx.user.create({
                  data: {
                    email: patient.email,
                    phone: patient.phone,
                    fullName: patient.fullName,
                    status: 'invited',
                    roles: {
                      create: { roleCode: 'patient', grantedBy: actorId },
                    },
                  },
                })
                accountId = user.id
                if (invitation) {
                  const created = await tx.invitation.create({
                    data: {
                      userId: user.id,
                      invitedBy: actorId,
                      tokenHash: invitation.tokenHash,
                      expiresAt: invitation.expiresAt,
                    },
                  })
                  await enqueueNotification(
                    tx,
                    {
                      type: 'account.invited',
                      aggregateId: created.id,
                      version: 1,
                      userId: user.id,
                      requestId: invitation.requestId,
                    },
                    this.secrets.seal(
                      invitation.token,
                      `notification:${user.id}:account.invited`,
                    ),
                  )
                }
              }
              const created = await tx.patientProfile.create({
                data: {
                  userId: accountId,
                  fullName: patient.fullName,
                  birthDate: patient.birthDate,
                  cpf: patient.cpf,
                  phone: patient.phone,
                  email: patient.email,
                  ...(guardianUserId && relationship
                    ? {
                        guardians: {
                          create: { guardianUserId, relationship },
                        },
                      }
                    : {}),
                },
                include: { guardians: true },
              })
              return {
                patientId: created.id,
                accountId,
                guardianLinkId: created.guardians[0]?.id ?? null,
              }
            },
            recordConsent: (input) => recordConsentEvent(tx, input),
            audit: new PrismaAuditWriter(tx),
          }
          return run(adapter)
        },
        { timeout: 10000 },
      )
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002')
        throw new ApplicationError('CONFLICT')
      throw error
    }
  }

  async dependents(userId: string) {
    const links = await this.db.guardianLink.findMany({
      where: { guardianUserId: userId, status: 'active', endedAt: null },
      include: { patient: true },
      orderBy: { startedAt: 'asc' },
    })
    return links.map((link) => ({
      patientId: link.patientId,
      fullName: link.patient.fullName,
      relationship: link.relationship,
      status: link.patient.status,
    }))
  }
}
