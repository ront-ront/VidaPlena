import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { clinicDate } from '../../domain/rules/arrival'
import { normalizeCpf } from '../../domain/rules/patient-identity'
import { ApplicationError } from '../errors/application-error'
import type {
  AppointmentImportStore,
  AppointmentImportTransaction,
  ImportAppointment,
} from '../ports/appointment-imports'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type { AppointmentRecord } from '../ports/booking'
import type {
  ImportBatch,
  ImportReport,
  ImportRowResult,
  PatientCsvParser,
} from '../ports/patient-imports'
import { eligibleBookingSlot } from './booking-policy'
import { importSystem } from './import-patients'
import { ReserveSlot } from './reserve-slot'

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex')
const rowSchema = z.object({
  externalId: z.string().trim().min(1).max(64),
  patientCpf: z.string().transform(normalizeCpf).pipe(z.string()),
  professionalExternalId: z.uuid().transform((v) => v.toLowerCase()),
  specialtyCode: z.string().trim().min(1).max(64),
  roomName: z.string().trim().max(120),
  startsAt: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v).toISOString()),
  endsAt: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v).toISOString()),
  modality: z.enum(['onsite', 'remote']),
  visitType: z.enum(['first', 'return']),
  status: z.enum(['confirmed', 'cancelled', 'completed']),
  sourceSystem: importSystem,
})
type Row = {
  data: ImportAppointment | null
  hash: string | null
  result: ImportRowResult
}
type Resolved = { result: ImportRowResult; data?: AppointmentRecord }
export class ImportAppointments {
  constructor(
    private readonly store: AppointmentImportStore,
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
  private parse(batch: ImportBatch): { rows: Row[]; fileErrors: string[] } {
    const parsed = this.parser.parse(
      batch.file,
      Math.max(batch.rows.length, this.policy.maxRows),
    )
    const keys = [
      'externalId',
      'patientCpf',
      'professionalExternalId',
      'specialtyCode',
      'roomName',
      'startsAt',
      'endsAt',
      'modality',
      'visitType',
      'status',
      'sourceSystem',
    ]
    const rows = parsed.rows.map(({ line, values }): Row => {
      const value = rowSchema.safeParse(
        Object.fromEntries(keys.map((key, i) => [key, values[i]])),
      )
      const errors = value.success
        ? []
        : [
            ...new Set(
              value.error.issues.map(
                (i) =>
                  `INVALID_${String(i.path[0] ?? 'ROW')
                    .replace(/[A-Z]/g, (v) => `_${v}`)
                    .toUpperCase()}`,
              ),
            ),
          ]
      const data = value.success ? value.data : null
      if (data) {
        if (data.sourceSystem !== batch.sourceSystem)
          errors.push('SOURCE_SYSTEM_MISMATCH')
        if ((data.modality === 'onsite') !== !!data.roomName)
          errors.push('INVALID_ROOM_NAME')
        if (data.startsAt >= data.endsAt) errors.push('INVALID_INTERVAL')
      }
      return {
        data,
        hash: data ? hash(JSON.stringify(data)) : null,
        result: {
          line,
          status: errors.length ? 'rejected' : 'accepted',
          errors,
          ...(data
            ? {
                externalId: data.externalId,
                cpfMasked: `***.***.***-${data.patientCpf.slice(-2)}`,
                startsAt: data.startsAt,
                endsAt: data.endsAt,
                modality: data.modality,
                appointmentStatus: data.status,
              }
            : {}),
        },
      }
    })
    const duplicates = new Map<string, number>()
    for (const row of rows)
      if (row.data)
        duplicates.set(
          row.data.externalId,
          (duplicates.get(row.data.externalId) ?? 0) + 1,
        )
    for (const row of rows)
      if (row.data && (duplicates.get(row.data.externalId) ?? 0) > 1) {
        row.result.status = 'rejected'
        row.result.errors.push('DUPLICATE_EXTERNAL_ID_FILE')
      }
    return { rows, fileErrors: parsed.fileErrors }
  }
  private report(
    batch: ImportBatch,
    replayed = false,
    newCount?: number,
  ): ImportReport {
    const display = new Map(
      this.parse(batch).rows.map((r) => [r.result.line, r.result]),
    )
    const rows = batch.rows.map(
      (r): ImportRowResult => ({
        ...display.get(r.line),
        line: r.line,
        status: r.finalStatus ?? r.previewStatus,
        errors: r.finalErrors ?? r.previewErrors,
        ...(r.targetId ? { targetId: r.targetId } : {}),
        ...((r.finalDuplicateOf ?? r.previewDuplicateOf)
          ? {
              duplicateOf:
                r.finalDuplicateOf ?? r.previewDuplicateOf ?? undefined,
            }
          : {}),
      }),
    )
    return {
      batchId: batch.id,
      kind: 'appointments',
      sourceSystem: batch.sourceSystem,
      fileHash: batch.fileHash,
      status: batch.status,
      createdAt: batch.createdAt.toISOString(),
      createdBy: batch.createdBy,
      expiresAt: batch.expiresAt.toISOString(),
      confirmedAt: batch.confirmedAt?.toISOString() ?? null,
      cutoffDate: batch.cutoffDate?.toISOString().slice(0, 10) ?? null,
      fileErrors: batch.fileErrors,
      accepted: rows.filter((r) => r.status !== 'rejected').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      imported: newCount ?? rows.filter((r) => r.status === 'imported').length,
      existing: rows.filter((r) => r.status === 'existing').length,
      replayed,
      rows,
    }
  }
  private async current(tx: AppointmentImportTransaction, actor: Principal) {
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
  private async evaluate(
    tx: AppointmentImportTransaction,
    row: Row,
    actor: Principal,
    now: Date,
  ): Promise<Resolved> {
    if (!row.data || !row.hash || row.result.errors.length)
      return { result: row.result }
    const d = row.data,
      prior = await tx.identity(d.sourceSystem, d.externalId)
    if (prior)
      return {
        result:
          prior.rowHash === row.hash
            ? {
                ...row.result,
                status: 'existing',
                targetId: prior.appointmentId,
              }
            : {
                ...row.result,
                status: 'rejected',
                errors: ['SOURCE_KEY_CONFLICT'],
                duplicateOf: prior.appointmentId,
              },
      }
    const fail = (code: string): Resolved => ({
      result: { ...row.result, status: 'rejected', errors: [code] },
    })
    const patient = await tx.patient(d.patientCpf)
    if (!patient) return fail('PATIENT_NOT_FOUND')
    if (!patient.active) return fail('PATIENT_INACTIVE')
    if (patient.revoked) return fail('CONSENT_REVOKED')
    const refs = await tx.references(d)
    if (!refs.professionalId) return fail('PROFESSIONAL_NOT_FOUND')
    if (!refs.specialtyId) return fail('SPECIALTY_NOT_FOUND')
    if (d.modality === 'onsite' && !refs.roomId) return fail('ROOM_NOT_FOUND')
    // Lock before re-reading eligibility, in the same order used by BE-020.
    await tx.booking.reservations.lockResources(
      [refs.professionalId],
      refs.roomId ? [refs.roomId] : [],
    )
    const target = await tx.booking.target(
      refs.professionalId,
      refs.specialtyId,
    )
    if (
      !target?.active ||
      !target.linked ||
      !target.specialtyActive ||
      !target.modalities.includes(d.modality) ||
      !target.specialtyModalities.includes(d.modality) ||
      (refs.roomId && !(await tx.booking.reservations.roomActive(refs.roomId)))
    )
      return fail('SLOT_UNAVAILABLE')
    const durationMinutes =
      d.visitType === 'first' ? target.durationFirst : target.durationReturn
    const startsAt = new Date(d.startsAt),
      endsAt = new Date(d.endsAt)
    if (endsAt.getTime() - startsAt.getTime() !== durationMinutes * 60_000)
      return fail('INVALID_DURATION')
    if (
      (d.status === 'confirmed' && startsAt <= now) ||
      (d.status === 'completed' && endsAt > now)
    )
      return fail('INVALID_STATUS_TIME')
    const appointment: AppointmentRecord = {
      id: randomUUID(),
      patientId: patient.id,
      professionalId: refs.professionalId,
      specialtyId: refs.specialtyId,
      roomId: refs.roomId,
      modality: d.modality,
      visitType: d.visitType,
      startsAt,
      endsAt,
      durationMinutes,
      specialtyVersion: target.specialtyVersion,
      status: d.status,
      version: 1,
      bookingSource: 'imported',
      createdBy: actor.userId,
      parentAppointmentId: null,
      reason: null,
      notificationAttention: false,
    }
    if (d.status === 'confirmed') {
      try {
        await eligibleBookingSlot(
          tx.booking,
          {
            patientId: patient.id,
            professionalId: refs.professionalId,
            specialtyId: refs.specialtyId,
            modality: d.modality,
            visitType: d.visitType,
            startsAt: d.startsAt,
            roomId: refs.roomId,
          },
          false,
          now,
        )
      } catch (error) {
        if (
          error instanceof ApplicationError &&
          [
            'SLOT_UNAVAILABLE',
            'VALIDATION_ERROR',
            'BOOKING_LEAD_TIME',
          ].includes(error.code)
        )
          return fail('SLOT_UNAVAILABLE')
        throw error
      }
      // Preview ignores expired holds without modifying them; ReserveSlot expires on confirmation.
      if (await tx.occupied(appointment, now)) return fail('SLOT_UNAVAILABLE')
    }
    return { result: row.result, data: appointment }
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
          fileHash: hash(file),
          file,
          fileErrors: [],
          status: 'preview',
          createdBy: current.userId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + this.policy.ttlMinutes * 60_000),
          cutoffDate: this.policy.cutoffDate
            ? new Date(`${this.policy.cutoffDate}T00:00:00Z`)
            : null,
          confirmedAt: null,
          rows: [],
        }
        const parsed = this.parse(batch),
          candidates: AppointmentRecord[] = []
        batch.fileErrors = parsed.fileErrors
        batch.status = parsed.fileErrors.length ? 'invalid' : 'preview'
        for (const row of parsed.rows) {
          const evaluated = await this.evaluate(tx, row, current, now)
          let result = evaluated.result
          const data = evaluated.data
          if (data?.status === 'confirmed') {
            if (
              candidates.some(
                (c) =>
                  c.startsAt < data.endsAt &&
                  c.endsAt > data.startsAt &&
                  (c.professionalId === data.professionalId ||
                    (!!data.roomId && c.roomId === data.roomId)),
              )
            )
              result = {
                ...result,
                status: 'rejected',
                errors: ['SLOT_UNAVAILABLE'],
              }
            else candidates.push(data)
          }
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
                'Confira o cabeçalho, o encoding e o modelo de importação.',
            },
          ],
          { importReport: report },
        )
      return report
    } catch (error) {
      return this.denied(actor, context, actor.userId, error)
    }
  }
  async kind(actor: Principal, id: string, context: AuditContext) {
    try {
      return await this.store.transaction(async (tx) => {
        const current = await this.current(tx, actor),
          kind = await tx.kind(id, current.userId)
        if (!kind) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        return kind
      })
    } catch (error) {
      return this.denied(actor, context, id, error)
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
      const batch = await this.store.transaction(async (tx) => {
        const current = await this.current(tx, actor),
          batch = await tx.batch(id, current.userId)
        if (!batch) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (
          batch.fileHash !== expectedFileHash ||
          hash(batch.file) !== batch.fileHash
        )
          throw new ApplicationError('CONFLICT')
        const requestKey = hash(
            `${current.userId}:import_appointments:${key.toLowerCase()}`,
          ),
          inputHash = hash(JSON.stringify([id, expectedFileHash])),
          prior = await tx.command(requestKey)
        if (prior && (prior.batchId !== id || prior.inputHash !== inputHash))
          throw new ApplicationError('CONFLICT')
        if (
          batch.status === 'invalid' ||
          (batch.status === 'preview' && batch.expiresAt <= this.now())
        )
          throw new ApplicationError('CONFLICT')
        if (!prior)
          await tx.recordCommand(requestKey, inputHash, current.userId, id)
        if (batch.status === 'preview') {
          if (this.parse(batch).fileErrors.length)
            throw new ApplicationError('CONFLICT')
          await tx.start(id)
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'import.started',
            resourceType: 'ImportBatch',
            resourceId: id,
          })
        }
        if (batch.status === 'confirmed')
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'import.replayed',
            resourceType: 'ImportBatch',
            resourceId: id,
            metadata: { count: 0 },
          })
        return batch
      })
      if (batch.status === 'confirmed') return this.report(batch, true, 0)
      let imported = 0
      for (const row of this.parse(batch).rows) {
        try {
          imported += await this.store.transaction(async (tx) => {
            const current = await this.current(tx, actor),
              stored = await tx.row(id, row.result.line)
            if (!stored) throw new ApplicationError('CONFLICT')
            if (stored.finalStatus) return 0
            const evaluated =
              stored.previewStatus === 'rejected'
                ? {
                    result: {
                      ...row.result,
                      status: 'rejected' as const,
                      errors: stored.previewErrors,
                      duplicateOf: stored.previewDuplicateOf ?? undefined,
                    },
                  }
                : await this.evaluate(tx, row, current, this.now())
            let result = evaluated.result
            const data = evaluated.data
            if (data && row.data && row.hash) {
              if (data.status === 'confirmed')
                await new ReserveSlot(
                  tx.booking.reservations,
                  this.now,
                ).reserve({
                  requestKey: `import:${id}:${row.result.line}`,
                  professionalId: data.professionalId,
                  roomId: data.roomId,
                  modality: data.modality,
                  startsAt: data.startsAt,
                  endsAt: data.endsAt,
                  state: 'confirmed',
                  appointmentId: data.id,
                })
              await tx.booking.create(data)
              const classification = batch.cutoffDate
                ? clinicDate(data.startsAt, this.policy.timeZone) <
                  batch.cutoffDate.toISOString().slice(0, 10)
                  ? 'before_cutoff'
                  : 'on_or_after_cutoff'
                : 'undated'
              await tx.identify(
                row.data,
                row.hash,
                data.id,
                batch,
                this.now(),
                classification,
              )
              await tx.booking.history(data, current, 'imported')
              result = { ...result, status: 'imported', targetId: data.id }
            }
            await tx.finishRow(id, result)
            await tx.audit.append({
              ...context,
              actorUserId: current.userId,
              actorRoles: current.roles,
              action: 'import.row_confirmed',
              resourceType: 'ImportBatch',
              resourceId: id,
              metadata: { count: data ? 1 : 0, status: result.status },
            })
            return data ? 1 : 0
          })
        } catch (error) {
          if (
            !(error instanceof ApplicationError) ||
            error.code !== 'SLOT_UNAVAILABLE'
          )
            throw error
          await this.store.transaction(async (tx) => {
            const current = await this.current(tx, actor),
              stored = await tx.row(id, row.result.line)
            if (!stored || stored.finalStatus) return
            await tx.finishRow(id, {
              ...row.result,
              status: 'rejected',
              errors: ['SLOT_UNAVAILABLE'],
            })
            await tx.audit.append({
              ...context,
              actorUserId: current.userId,
              actorRoles: current.roles,
              action: 'import.row_rejected',
              resourceType: 'ImportBatch',
              resourceId: id,
              metadata: { status: 'rejected', reasonCode: 'SLOT_UNAVAILABLE' },
            })
          })
        }
      }
      return await this.store.transaction(async (tx) => {
        const current = await this.current(tx, actor),
          final = await tx.batch(id, current.userId)
        if (!final) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (final.status !== 'confirmed') {
          await tx.complete(id, this.now())
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'import.confirmed',
            resourceType: 'ImportBatch',
            resourceId: id,
            metadata: {
              count: final.rows.filter((r) => r.finalStatus === 'imported')
                .length,
              status: 'confirmed',
            },
          })
        }
        return this.report(
          {
            ...final,
            status: 'confirmed',
            confirmedAt: final.confirmedAt ?? this.now(),
          },
          false,
          imported,
        )
      })
    } catch (error) {
      return this.denied(actor, context, id, error)
    }
  }
}
