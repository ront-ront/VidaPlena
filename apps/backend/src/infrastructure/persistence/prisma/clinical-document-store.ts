import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import { ClinicalIntegrityError } from '../../../application/errors/clinical-integrity-error'
import type {
  ClinicalDocument,
  ClinicalDocumentStore,
  ClinicalDocumentTransaction,
  DocumentTypeVersion,
} from '../../../application/ports/clinical-documents'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaClinicalRecordStore } from './clinical-record-store'
import type { PrismaMedicationStore } from './medication-store'

const namedUser = { select: { id: true, fullName: true } } as const
const typeInclude = { type: true, changedBy: namedUser } as const
const documentInclude = {
  record: { select: { patientId: true } },
  typeVersion: { include: typeInclude },
  voidEvent: true,
  prescriptionAcknowledgements: true,
} as const
export class PrismaClinicalDocumentStore implements ClinicalDocumentStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly records: PrismaClinicalRecordStore,
    private readonly secrets: SecretBox,
    private readonly medications: PrismaMedicationStore,
  ) {}
  transaction<T>(
    run: (tx: ClinicalDocumentTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  private type(
    row: Prisma.DocumentTypeVersionGetPayload<{ include: typeof typeInclude }>,
  ): DocumentTypeVersion {
    return {
      id: row.id,
      typeId: row.typeId,
      version: row.version,
      code: row.type.code as DocumentTypeVersion['code'],
      label: row.type.label,
      requiredSignatureLevel:
        row.requiredSignatureLevel as DocumentTypeVersion['requiredSignatureLevel'],
      templateVersion: row.templateVersion,
      active: row.active,
      reason: row.reasonEncrypted
        ? this.secrets.open(row.reasonEncrypted, `document_type:${row.id}`)
        : null,
      changedBy: row.changedBy
        ? { id: row.changedBy.id, name: row.changedBy.fullName }
        : null,
      createdAt: row.createdAt,
    }
  }
  private project(
    row: Prisma.ClinicalDocumentGetPayload<{ include: typeof documentInclude }>,
  ): ClinicalDocument {
    try {
      const signature = row.signatureEncrypted
        ? JSON.parse(
            this.secrets.open(
              row.signatureEncrypted,
              `document_signature:${row.id}`,
            ),
          )
        : null
      return {
        id: row.id,
        recordId: row.recordId,
        patientId: row.record.patientId,
        encounterId: row.encounterId,
        authorProfessionalId: row.authorProfessionalId,
        type: this.type(row.typeVersion),
        copiedFromDocumentId: row.copiedFromDocumentId,
        files: [],
        allergyAcknowledgements: row.prescriptionAcknowledgements.map((a) => ({
          alertId: a.alertId,
          alertVersion: a.alertVersion,
          professionalId: a.professionalId,
          acknowledgedAt: a.acknowledgedAt.toISOString(),
        })),
        payloadVersion: row.payloadVersion,
        payload: JSON.parse(
          this.secrets.open(row.payloadEncrypted, `document_payload:${row.id}`),
        ),
        version: row.version,
        status: row.status as ClinicalDocument['status'],
        createdAt: row.createdAt,
        savedAt: row.savedAt,
        canonical: row.canonicalEncrypted
          ? this.secrets.open(
              row.canonicalEncrypted,
              `document_canonical:${row.id}`,
            )
          : null,
        signature: signature?.evidence ?? null,
        verificationCode: signature?.verificationCode ?? null,
        verificationCodeHash: row.verificationCodeHash,
        sha256: row.sha256,
        issuedAt: row.issuedAt,
        voidEvent: row.voidEvent
          ? {
              id: row.voidEvent.id,
              reason: this.secrets.open(
                row.voidEvent.reasonEncrypted,
                `document_void:${row.voidEvent.id}`,
              ),
              replacementDocumentId: row.voidEvent.replacementDocumentId,
              createdAt: row.voidEvent.createdAt,
              authorProfessionalId: row.voidEvent.authorProfessionalId,
            }
          : null,
      }
    } catch {
      throw new ClinicalIntegrityError(row.id)
    }
  }
  scope(tx: Prisma.TransactionClient): ClinicalDocumentTransaction {
    const document = async (id: string) => {
      const row = await tx.clinicalDocument.findUnique({
        where: { id },
        include: documentInclude,
      })
      if (!row) return null
      const result = this.project(row)
      const files = await tx.fileObject.findMany({
        where: {
          linkedResourceType: 'ClinicalDocument',
          linkedResourceId: row.id,
          revokedAt: null,
          ownerPatientId: row.record.patientId,
          category: 'attachment',
        },
        select: {
          id: true,
          contentTypeDetected: true,
          size: true,
          sha256: true,
        },
        orderBy: { id: 'asc' },
      })
      result.files = files.map((f) => ({
        id: f.id,
        contentType: f.contentTypeDetected,
        size: Number(f.size),
        sha256: f.sha256,
      }))
      return result
    }
    const required = async (id: string) => {
      const row = await document(id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      return row
    }
    return {
      ...this.records.scope(tx),
      ...this.medications.scope(tx),
      documentTypes: async () => {
        const rows = await tx.documentType.findMany({
          orderBy: { code: 'asc' },
          include: {
            versions: { orderBy: { version: 'desc' }, include: typeInclude },
          },
        })
        return rows.flatMap((row) =>
          row.versions.length
            ? [
                {
                  type: this.type(row.versions[0]),
                  history: row.versions.map((v) => this.type(v)),
                },
              ]
            : [],
        )
      },
      documentType: async (idOrCode) => {
        const row = await tx.documentType.findFirst({
          where: {
            OR: [
              { code: idOrCode },
              ...(/^[a-f0-9-]{36}$/i.test(idOrCode) ? [{ id: idOrCode }] : []),
            ],
          },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              include: typeInclude,
            },
          },
        })
        return row?.versions[0] ? this.type(row.versions[0]) : null
      },
      lockDocumentType: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "DocumentType" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      changeDocumentType: async (type, actorUserId, input, now) => {
        const id = randomUUID()
        const row = await tx.documentTypeVersion.create({
          data: {
            id,
            typeId: type.typeId,
            version: type.version + 1,
            requiredSignatureLevel: input.requiredSignatureLevel,
            templateVersion: input.templateVersion,
            active: input.active,
            reasonEncrypted: this.secrets.seal(
              input.reason,
              `document_type:${id}`,
            ),
            changedByUserId: actorUserId,
            createdAt: now,
          },
          include: typeInclude,
        })
        return this.type(row)
      },
      documentSubject: async (id) => {
        const row = await tx.clinicalDocument.findUnique({
          where: { id },
          select: {
            id: true,
            encounterId: true,
            authorProfessionalId: true,
            status: true,
            record: { select: { patientId: true } },
          },
        })
        return row
          ? {
              id: row.id,
              encounterId: row.encounterId,
              authorProfessionalId: row.authorProfessionalId,
              patientId: row.record.patientId,
              status: row.status as ClinicalDocument['status'],
            }
          : null
      },
      document,
      documentByVerificationHash: async (hash) =>
        (
          await tx.clinicalDocument.findUnique({
            where: { verificationCodeHash: hash },
            select: { id: true },
          })
        )?.id ?? null,
      documentEncounter: async (id) => {
        const row = await tx.clinicalEncounter.findUnique({
          where: { id },
          include: {
            record: { select: { patientId: true } },
            appointment: {
              select: { status: true, specialtyId: true, modality: true },
            },
          },
        })
        return row
          ? {
              id: row.id,
              recordId: row.recordId,
              patientId: row.record.patientId,
              professionalId: row.professionalId,
              status: row.status,
              appointmentId: row.appointmentId,
              appointmentStatus: row.appointment.status,
              specialtyId: row.appointment.specialtyId,
              modality: row.appointment.modality,
            }
          : null
      },
      documentSigner: async (id) => {
        const row = await tx.professionalProfile.findUnique({
          where: { id },
          include: { user: { select: { fullName: true } } },
        })
        return row
          ? {
              id: row.id,
              name: row.user.fullName,
              council: {
                type: row.councilType,
                region: row.councilRegion,
                number: row.councilNumber,
              },
            }
          : null
      },
      lockDocument: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "ClinicalDocument" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      createDocument: async (
        encounter,
        type,
        payload,
        now,
        copiedFromDocumentId,
      ) => {
        const id = randomUUID()
        await tx.clinicalDocument.create({
          data: {
            id,
            recordId: encounter.recordId,
            encounterId: encounter.id,
            authorProfessionalId: encounter.professionalId,
            typeVersionId: type.id,
            copiedFromDocumentId,
            payloadVersion: 1,
            payloadEncrypted: this.secrets.seal(
              JSON.stringify(payload),
              `document_payload:${id.toLowerCase()}`,
            ),
            createdAt: now,
            savedAt: now,
          },
        })
        return required(id)
      },
      attachDocumentFile: async (
        document,
        stored,
        scan,
        maxPerRecord,
        context,
      ) => {
        const count = await tx.fileObject.count({
          where: {
            linkedResourceType: 'ClinicalDocument',
            linkedResourceId: document.id,
            revokedAt: null,
          },
        })
        if (count >= maxPerRecord)
          throw new ApplicationError('UNPROCESSABLE_FILE')
        const file = await tx.fileObject.create({
          data: {
            category: 'attachment',
            ownerPatientId: document.patientId,
            linkedResourceType: 'ClinicalDocument',
            linkedResourceId: document.id,
            storageKey: stored.storageKey,
            contentTypeDetected: scan.detectedType,
            size: BigInt(stored.size),
            sha256: stored.sha256,
            encryptionKeyRef: 'local:v1',
            scanStatus: scan.status,
            uploadedBy: context.actorUserId,
          },
        })
        await this.records.scope(tx).audit.append({
          ...context,
          action: 'file.uploaded',
          resourceType: 'FileObject',
          resourceId: file.id,
          subjectPatientId: document.patientId,
          metadata: { fileCategory: 'attachment', scanStatus: scan.status },
        })
        return {
          id: file.id,
          contentType: file.contentTypeDetected,
          size: Number(file.size),
          sha256: file.sha256,
        }
      },
      acknowledgePrescriptionAllergy: async (
        documentId,
        alertId,
        alertVersion,
        professionalId,
        now,
      ) => {
        await tx.prescriptionAllergyAcknowledgement.create({
          data: {
            documentId,
            alertId,
            alertVersion,
            professionalId,
            acknowledgedAt: now,
          },
        })
      },
      updateDocument: async (
        id,
        typeVersionId,
        payload,
        expectedVersion,
        now,
      ) => {
        const updated = await tx.clinicalDocument.updateMany({
          where: { id, status: 'draft', version: expectedVersion },
          data: {
            typeVersionId,
            payloadEncrypted: this.secrets.seal(
              JSON.stringify(payload),
              `document_payload:${id.toLowerCase()}`,
            ),
            version: { increment: 1 },
            savedAt: now,
          },
        })
        if (updated.count !== 1) throw new ApplicationError('CONFLICT')
        return required(id)
      },
      issueDocument: async (id, input) => {
        const updated = await tx.clinicalDocument.updateMany({
          where: { id, status: 'draft' },
          data: {
            status: input.status,
            canonicalEncrypted: this.secrets.seal(
              input.canonical,
              `document_canonical:${id.toLowerCase()}`,
            ),
            signatureEncrypted: this.secrets.seal(
              JSON.stringify({
                evidence: input.signature,
                verificationCode: input.verificationCode,
              }),
              `document_signature:${id.toLowerCase()}`,
            ),
            verificationCodeHash: input.verificationCodeHash,
            sha256: input.signature.sha256,
            issuedAt: input.issuedAt,
          },
        })
        if (updated.count !== 1) throw new ApplicationError('CONFLICT')
        return required(id)
      },
      voidDocument: async (
        id,
        authorProfessionalId,
        reason,
        replacementDocumentId,
        now,
      ) => {
        const eventId = randomUUID()
        await tx.clinicalDocumentVoid.create({
          data: {
            id: eventId,
            documentId: id,
            authorProfessionalId,
            reasonEncrypted: this.secrets.seal(
              reason,
              `document_void:${eventId}`,
            ),
            replacementDocumentId,
            createdAt: now,
          },
        })
        return required(id)
      },
    }
  }
}
