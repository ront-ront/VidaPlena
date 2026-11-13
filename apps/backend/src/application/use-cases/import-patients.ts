import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { clinicDate } from '../../domain/rules/arrival'
import { civilDate, normalizeCpf } from '../../domain/rules/patient-identity'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ImportBatch,
  ImportPatient,
  ImportReport,
  ImportRowResult,
  PatientCsvParser,
  PatientImportStore,
  PatientImportTransaction,
} from '../ports/patient-imports'

export const importSystem = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.:-]+$/)
const patientRow = z.object({
  externalId: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(2).max(255),
  birthDate: z.string().refine((value) => !!civilDate(value)),
  cpf: z
    .string()
    .transform((value) => normalizeCpf(value))
    .pipe(z.string()),
  email: z
    .string()
    .trim()
    .transform((value) => (value ? value.toLowerCase() : null))
    .pipe(z.email().nullable()),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[().\s-]/g, ''))
    .pipe(z.union([z.literal(''), z.string().regex(/^\+?\d{8,15}$/)]))
    .transform((value) => value || null),
  sourceSystem: importSystem,
})
type Row = {
  result: ImportRowResult
  data: ImportPatient | null
  hash: string | null
}
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex')
export class ImportPatients {
  constructor(
    private readonly store: PatientImportStore,
    private readonly parser: PatientCsvParser,
    private readonly audit: AuditWriter,
    private readonly policy: {
      maxRows: number
      maxBytes: number
      ttlMinutes: number
      cutoffDate: string | null
      timeZone: string
    },
    private readonly now = () => new Date(),
  ) {}
  private parsed(
    batch: ImportBatch,
    maxRows = this.policy.maxRows,
  ): { rows: Row[]; fileErrors: string[] } {
    const parsed = this.parser.parse(batch.file, maxRows)
    if (parsed.fileErrors.length)
      return { rows: [], fileErrors: parsed.fileErrors }
    const keys = [
      'externalId',
      'fullName',
      'birthDate',
      'cpf',
      'email',
      'phone',
      'sourceSystem',
    ]
    const rows = parsed.rows.map(({ line, values }): Row => {
      const value = patientRow.safeParse(
        Object.fromEntries(keys.map((key, i) => [key, values[i]])),
      )
      const errors: string[] = []
      if (!value.success)
        for (const issue of value.error.issues)
          errors.push(
            `INVALID_${String(issue.path[0] ?? 'ROW')
              .replace(/[A-Z]/g, (letter) => `_${letter}`)
              .toUpperCase()}`,
          )
      if (
        value.success &&
        value.data.birthDate > clinicDate(batch.createdAt, this.policy.timeZone)
      )
        errors.push('INVALID_BIRTH_DATE')
      if (value.success && value.data.sourceSystem !== batch.sourceSystem)
        errors.push('SOURCE_SYSTEM_MISMATCH')
      const data = value.success ? value.data : null
      return {
        data,
        hash: data ? hash(JSON.stringify(data)) : null,
        result: {
          line,
          status: errors.length ? 'rejected' : 'accepted',
          errors: [...new Set(errors)],
          ...(data
            ? {
                externalId: data.externalId,
                fullName: data.fullName,
                cpfMasked: `***.***.***-${data.cpf.slice(-2)}`,
              }
            : {}),
        },
      }
    })
    const cpfs = new Map<string, number[]>(),
      external = new Map<string, number[]>()
    for (const row of rows)
      if (row.data) {
        cpfs.set(row.data.cpf, [
          ...(cpfs.get(row.data.cpf) ?? []),
          row.result.line,
        ])
        external.set(row.data.externalId, [
          ...(external.get(row.data.externalId) ?? []),
          row.result.line,
        ])
      }
    for (const row of rows)
      if (row.data) {
        if ((cpfs.get(row.data.cpf)?.length ?? 0) > 1)
          row.result.errors.push('DUPLICATE_CPF_FILE')
        if ((external.get(row.data.externalId)?.length ?? 0) > 1)
          row.result.errors.push('DUPLICATE_EXTERNAL_ID_FILE')
        if (row.result.errors.length) row.result.status = 'rejected'
      }
    return { rows, fileErrors: [] }
  }
  private async evaluate(tx: PatientImportTransaction, row: Row) {
    if (!row.data || !row.hash || row.result.errors.length) return row.result
    const identity = await tx.identity(
      row.data.sourceSystem,
      row.data.externalId,
    )
    if (identity) {
      return identity.rowHash === row.hash
        ? {
            ...row.result,
            status: 'existing' as const,
            targetId: identity.patientId,
          }
        : {
            ...row.result,
            status: 'rejected' as const,
            errors: ['SOURCE_KEY_CONFLICT'],
            duplicateOf: identity.patientId,
          }
    }
    const patient = await tx.patient(row.data.cpf)
    return patient
      ? {
          ...row.result,
          status: 'rejected' as const,
          errors: ['DUPLICATE_CPF'],
          duplicateOf: patient.id,
        }
      : row.result
  }
  private report(batch: ImportBatch, replayed = false): ImportReport {
    const display = this.parsed(
      batch,
      Math.max(batch.rows.length, this.policy.maxRows),
    )
    const rows = batch.rows.map((row) => {
      const fields = display.rows.find(
        (value) => value.result.line === row.line,
      )?.result
      return {
        ...(fields ?? { line: row.line }),
        status: row.finalStatus ?? row.previewStatus,
        errors: row.finalErrors ?? row.previewErrors,
        ...(row.targetId ? { targetId: row.targetId } : {}),
        ...((row.finalDuplicateOf ?? row.previewDuplicateOf)
          ? {
              duplicateOf:
                row.finalDuplicateOf ?? row.previewDuplicateOf ?? undefined,
            }
          : {}),
      } as ImportRowResult
    })
    return {
      batchId: batch.id,
      kind: 'patients',
      sourceSystem: batch.sourceSystem,
      fileHash: batch.fileHash,
      status: batch.status,
      createdAt: batch.createdAt.toISOString(),
      createdBy: batch.createdBy,
      expiresAt: batch.expiresAt.toISOString(),
      confirmedAt: batch.confirmedAt?.toISOString() ?? null,
      cutoffDate: batch.cutoffDate?.toISOString().slice(0, 10) ?? null,
      fileErrors: batch.fileErrors,
      accepted: rows.filter((row) => row.status !== 'rejected').length,
      rejected: rows.filter((row) => row.status === 'rejected').length,
      imported: replayed
        ? 0
        : rows.filter((row) => row.status === 'imported').length,
      existing: rows.filter((row) => row.status === 'existing').length,
      replayed,
      rows,
    }
  }
  private async current(tx: PatientImportTransaction, actor: Principal) {
    const current = await tx.principal(actor)
    if (!current || !mayAccess(current, 'import_patients'))
      throw new ApplicationError('FORBIDDEN')
    return current
  }
  private async denied(
    actor: Principal,
    context: AuditContext,
    id: string,
    error: unknown,
  ): Promise<never> {
    if (
      error instanceof ApplicationError &&
      ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
    )
      await this.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'authorization.denied',
        resourceType: 'ImportBatch',
        resourceId: id,
        authorizationBasis: 'denied',
      })
    throw error
  }
  async preview(
    actor: Principal,
    sourceSystem: string,
    file: Buffer,
    context: AuditContext,
  ) {
    try {
      if (file.length > this.policy.maxBytes)
        throw new ApplicationError('IMPORT_TOO_LARGE')
      const report = await this.store.transaction(async (tx) => {
        const current = await this.current(tx, actor),
          now = this.now(),
          source = importSystem.safeParse(sourceSystem)
        if (!source.success) throw new ApplicationError('VALIDATION_ERROR')
        const batch: ImportBatch = {
          id: randomUUID(),
          sourceSystem: source.data,
          file,
          fileHash: hash(file),
          fileErrors: [],
          status: 'preview',
          createdBy: current.userId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + this.policy.ttlMinutes * 60_000),
          cutoffDate: this.policy.cutoffDate
            ? civilDate(this.policy.cutoffDate)
            : null,
          confirmedAt: null,
          rows: [],
        }
        const parsed = this.parsed(batch)
        batch.fileErrors = parsed.fileErrors
        batch.status = parsed.fileErrors.length ? 'invalid' : 'preview'
        for (const row of parsed.rows) {
          const result = await this.evaluate(tx, row)
          batch.rows.push({
            line: result.line,
            previewStatus: result.status,
            previewErrors: result.errors,
            previewDuplicateOf: result.duplicateOf ?? null,
            finalStatus: null,
            finalErrors: null,
            finalDuplicateOf: null,
            targetId: result.targetId ?? null,
          })
        }
        await tx.saveBatch(batch)
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'import.previewed',
          resourceType: 'ImportBatch',
          resourceId: batch.id,
          metadata: { status: batch.status, count: batch.rows.length },
        })
        return this.report(batch)
      })
      if (report.fileErrors.length)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          [
            {
              field: 'file',
              reason:
                'CSV inválido. Confira o cabeçalho, o encoding e o modelo de importação.',
            },
          ],
          { importReport: report },
        )
      return report
    } catch (error) {
      return this.denied(actor, context, actor.userId, error)
    }
  }
  async read(actor: Principal, id: string, context: AuditContext) {
    try {
      return await this.store.transaction(async (tx) => {
        const current = await this.current(tx, actor),
          batch = await tx.batch(id, current.userId)
        if (!batch) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'import.report_read',
          resourceType: 'ImportBatch',
          resourceId: id,
        })
        return this.report(batch)
      })
    } catch (error) {
      return this.denied(actor, context, id, error)
    }
  }
  async confirm(
    actor: Principal,
    id: string,
    expectedFileHash: string,
    key: string,
    context: AuditContext,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const current = await this.current(tx, actor),
          batch = await tx.batch(id, current.userId),
          now = this.now()
        if (!batch) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (
          batch.fileHash !== expectedFileHash ||
          hash(batch.file) !== batch.fileHash
        )
          throw new ApplicationError('CONFLICT')
        const requestKey = hash(
            `${current.userId}:import_patients:${key.toLowerCase()}`,
          ),
          inputHash = hash(JSON.stringify([id, expectedFileHash]))
        const command = await tx.command(requestKey)
        if (
          command &&
          (command.inputHash !== inputHash || command.batchId !== id)
        )
          throw new ApplicationError('CONFLICT')
        if (batch.status === 'confirmed') {
          if (!command)
            await tx.recordCommand(requestKey, inputHash, current.userId, id)
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'import.replayed',
            resourceType: 'ImportBatch',
            resourceId: id,
            metadata: { count: 0 },
          })
          return this.report(batch, true)
        }
        if (batch.status !== 'preview' || batch.expiresAt <= now)
          throw new ApplicationError('CONFLICT')
        const parsed = this.parsed(batch)
        if (parsed.fileErrors.length) throw new ApplicationError('CONFLICT')
        const results: ImportRowResult[] = []
        for (const row of parsed.rows) {
          const previous = batch.rows.find(
            (value) => value.line === row.result.line,
          )
          let result =
            previous?.previewStatus === 'rejected'
              ? {
                  ...row.result,
                  status: 'rejected' as const,
                  errors: previous.previewErrors,
                  duplicateOf: previous.previewDuplicateOf ?? undefined,
                }
              : await this.evaluate(tx, row)
          if (result.status === 'accepted' && row.data && row.hash) {
            const patientId = await tx.createPatient(row.data)
            if (patientId) {
              await tx.identify(row.data, row.hash, patientId, batch, now)
              result = { ...result, status: 'imported', targetId: patientId }
            } else
              result = {
                ...result,
                status: 'rejected',
                errors: ['DUPLICATE_CPF'],
                duplicateOf: (await tx.patient(row.data.cpf))?.id,
              }
          }
          results.push(result)
        }
        await tx.finalize(id, results, now)
        await tx.recordCommand(requestKey, inputHash, current.userId, id)
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'import.confirmed',
          resourceType: 'ImportBatch',
          resourceId: id,
          metadata: {
            count: results.filter((row) => row.status === 'imported').length,
            status: 'confirmed',
          },
        })
        const final = await tx.batch(id, current.userId)
        if (!final) throw new ApplicationError('CONFLICT')
        return this.report(final)
      }, true)
    } catch (error) {
      return this.denied(actor, context, id, error)
    }
  }
}
