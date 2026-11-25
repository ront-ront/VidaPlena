import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { after, before, beforeEach, test } from 'node:test'
import { Temporal } from '@js-temporal/polyfill'
import request from 'supertest'
import type { FileRepository } from '../../src/application/ports/files'
import type { ManageFiles } from '../../src/application/use-cases/manage-files'
import type { ManageTerminologies } from '../../src/application/use-cases/manage-terminologies'
import { DevMalwareScanner } from '../../src/infrastructure/files/dev-malware-scanner'
import { LocalEncryptedFileStorage } from '../../src/infrastructure/files/local-encrypted-file-storage'
import { ConsentEvidenceReconciler } from '../../src/infrastructure/jobs/consent-evidence-reconciler'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { services } from '../../src/shared/composition/container'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { loadConfig } from '../../src/shared/config/environment'
import {
  addendumResponse,
  authoredEvolutionResponse,
  finalizedEvolutionResponse,
  finalizeEvolutionResponse,
} from '../../src/shared/infra/http/contracts/clinical-evolutions'
import { createClinicalFixture } from '../support/m2-clinical'

let f: Awaited<ReturnType<typeof createClinicalFixture>>
before(async () => {
  f = await createClinicalFixture()
})
beforeEach(async () => {
  await f.clearActive()
})
after(async () => {
  if (f) await f.close()
})
const token = () => f.professionalAccounts[0].token
const context = () => ({
  requestId: randomUUID(),
  actorRoles: ['professional'],
  authorizationBasis: 'test',
  actorUserId: f.professionalAccounts[0].user.id,
})
const finalize = (id: string, expectedDraftVersion = 1, auth = token()) =>
  request(f.app)
    .post(`/v1/clinical/evolutions/${id}/finalize`)
    .set('Authorization', auth)
    .send({ expectedDraftVersion })
const get = (id: string, auth = token()) =>
  request(f.app).get(`/v1/clinical/evolutions/${id}`).set('Authorization', auth)
const addendum = (
  id: string,
  body = {
    reason: 'Correção justificada fictícia',
    correctionText: '  Retificação fictícia preservada  ',
  },
  auth = token(),
) =>
  request(f.app)
    .post(`/v1/clinical/evolutions/${id}/addenda`)
    .set('Authorization', auth)
    .send(body)
async function draft(
  patient = undefined as Awaited<ReturnType<typeof f.patient>> | undefined,
  payload: Record<string, unknown> = {
    complaint: 'Queixa fictícia',
    conduct: 'Conduta fictícia',
  },
) {
  const v = await f.visit(patient)
  const row = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/evolutions/draft`)
      .set('Authorization', token())
      .send(payload)
      .expect(201)
  ).body
  return { ...v, evolutionId: row.evolutionId }
}
async function attach(evolutionId: string, patientId: string) {
  const storage = new LocalEncryptedFileStorage(
      f.config.fileStoragePath,
      f.config.encryptionKey,
    ),
    pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
  const saved = await storage.write(
    'attachment',
    Readable.from([pdf]),
    f.config.fileAttachmentMaxMb * 1024 * 1024,
  )
  try {
    const scan = await new DevMalwareScanner('test').scan({
      category: 'attachment',
      filename: 'ficticio.pdf',
      firstBytes: saved.firstBytes,
      size: saved.size,
      maxBytes: f.config.fileAttachmentMaxMb * 1024 * 1024,
    })
    const file = await f.scope
      .resolve<FileRepository>(services.fileRepository)
      .create(
        {
          category: 'attachment',
          ownerPatientId: patientId,
          linkedResourceType: 'ClinicalEvolution',
          linkedResourceId: evolutionId,
          storageKey: saved.storageKey,
          contentTypeDetected: scan.detectedType,
          size: saved.size,
          sha256: saved.sha256,
          scanStatus: scan.status,
          uploadedBy: f.professionalAccounts[0].user.id,
        },
        f.config.fileMaxPerRecord,
        context(),
      )
    return { file, storage, pdf }
  } catch (error) {
    await storage.remove('attachment', saved.storageKey)
    throw error
  }
}
test('BE-036: política aprovada e mínimo clínico revalidados sem completar campos pelo profissional', async () => {
  const policy = (
    await request(f.app)
      .get('/v1/clinical/evolution-policy')
      .set('Authorization', token())
      .expect(200)
  ).body
  assert.deepEqual(policy.requiredFields, f.config.evolutionRequiredFields)
  const v = await draft(undefined, {
    complaint: '  ',
    conduct: 'Conduta fictícia',
  })
  const failed = await finalize(v.evolutionId).expect(400)
  assert.ok(
    failed.body.error.details.some(
      (d: { field: string }) => d.field === 'complaint',
    ),
  )
  assert.equal(
    (
      await f.db.clinicalEvolution.findUniqueOrThrow({
        where: { id: v.evolutionId },
      })
    ).status,
    'draft',
  )
  await request(f.app)
    .patch(`/v1/clinical/evolutions/${v.evolutionId}/draft`)
    .set('Authorization', token())
    .set('Idempotency-Key', randomUUID())
    .send({ expectedDraftVersion: 1, complaint: 'Queixa preenchida' })
    .expect(200)
  const done = (await finalize(v.evolutionId, 2).expect(200)).body
  finalizeEvolutionResponse.parse(done)
  assert.equal(done.legalSignatureStatus, 'not_provided')
  const read = (await get(v.evolutionId).expect(200)).body
  finalizedEvolutionResponse.parse(read)
  assert.equal(read.history, '')
  assert.equal(read.physicalExam, '')
  assert.deepEqual(read.diagnosisCodes, [])
})
test('BE-036: finalização atômica fecha encontro/reserva, atualiza vínculo real, timeline e retenção', async () => {
  const v = await draft(),
    original = await f.db.clinicalEvolution.findUniqueOrThrow({
      where: { id: v.evolutionId },
    })
  const result = await finalize(v.evolutionId).expect(200),
    closed = new Date(result.body.finalizedAt)
  const row = await f.db.clinicalEvolution.findUniqueOrThrow({
    where: { id: v.evolutionId },
  })
  assert.equal(row.payloadEncrypted, original.payloadEncrypted)
  assert.equal(row.draftVersion, original.draftVersion)
  assert.match(row.contentHash ?? '', /^[a-f0-9]{64}$/)
  const encounter = await f.db.clinicalEncounter.findUniqueOrThrow({
    where: { id: v.encounterId },
  })
  assert.equal(encounter.status, 'completed')
  assert.equal(encounter.endedAt?.toISOString(), closed.toISOString())
  assert.equal(
    (
      await f.db.appointment.findUniqueOrThrow({
        where: { id: v.appointmentId },
      })
    ).status,
    'completed',
  )
  assert.equal(
    await f.db.slotReservation.count({
      where: { appointmentId: v.appointmentId, state: 'confirmed' },
    }),
    0,
  )
  assert.equal(
    await f.db.appointmentHistory.count({
      where: { appointmentId: v.appointmentId, action: 'completed' },
    }),
    1,
  )
  assert.equal(
    await f.db.slotReleaseEvent.count({
      where: { appointmentId: v.appointmentId, kind: 'completed' },
    }),
    1,
  )
  const link = await f.db.careLink.findUniqueOrThrow({
      where: { id: v.linkId },
    }),
    expected = Temporal.Instant.from(closed.toISOString())
      .toZonedDateTimeISO(f.config.clinicTimeZone)
      .add({ days: f.config.careLinkPolicy.postDays })
  assert.equal(
    link.endsAt.toISOString(),
    expected.toInstant().toString({ smallestUnit: 'millisecond' }),
  )
  const retention = await f.db.clinicalRetentionEvent.findUniqueOrThrow({
    where: { encounterId: v.encounterId },
  })
  assert.equal(retention.retentionYears, f.config.clinicalRetentionYears)
  assert.equal(retention.anchorAt.toISOString(), closed.toISOString())
  assert.equal(
    retention.retainUntil.toISOString(),
    Temporal.Instant.from(closed.toISOString())
      .toZonedDateTimeISO('UTC')
      .add({ years: f.config.clinicalRetentionYears })
      .toInstant()
      .toString({ smallestUnit: 'millisecond' }),
  )
  const header = (
    await request(f.app)
      .get(`/v1/clinical/records/${v.patientId}`)
      .set('Authorization', token())
      .expect(200)
  ).body
  assert.equal(header.lastEncounterAt, closed.toISOString())
  assert.equal(header.firstVisit, false)
  const timeline = (
    await request(f.app)
      .get(`/v1/clinical/records/${v.patientId}/timeline`)
      .set('Authorization', token())
      .expect(200)
  ).body
  assert.ok(
    timeline.items.some(
      (i: { type: string; resourceId: string }) =>
        i.type === 'evolution' && i.resourceId === v.evolutionId,
    ),
  )
  assert.equal(
    (await get(v.evolutionId).expect(200)).body.contentHash,
    row.contentHash,
  )
})
test('BE-036: finalização concorrente/versão antiga não duplica ou sobrescreve', async () => {
  const v = await draft()
  await finalize(v.evolutionId, 2).expect(409)
  const outcomes = await Promise.all([
    finalize(v.evolutionId),
    finalize(v.evolutionId),
  ])
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409])
  assert.equal(
    await f.db.clinicalRetentionEvent.count({
      where: { encounterId: v.encounterId },
    }),
    1,
  )
  assert.equal(
    await f.db.clinicalTimelineEntry.count({
      where: { resourceId: v.evolutionId, type: 'evolution' },
    }),
    1,
  )
  const row = await f.db.clinicalEvolution.findUniqueOrThrow({
    where: { id: v.evolutionId },
  })
  await assert.rejects(
    f.db.clinicalEvolution.update({
      where: { id: row.id },
      data: { payloadEncrypted: 'changed', draftVersion: 2 },
    }),
  )
  await assert.rejects(f.db.clinicalEvolution.delete({ where: { id: row.id } }))
  await request(f.app)
    .patch(`/v1/clinical/evolutions/${row.id}/draft`)
    .set('Authorization', token())
    .set('Idempotency-Key', randomUUID())
    .send({ expectedDraftVersion: 1, complaint: 'Não permitido' })
    .expect(409)
  assert.equal(
    (await f.db.clinicalEvolution.findUniqueOrThrow({ where: { id: row.id } }))
      .contentHash,
    row.contentHash,
  )
})
test('BE-036/030: autor mantém leitura/adendo após vínculo expirar; original permanece intacto', async () => {
  const v = await draft()
  await finalize(v.evolutionId).expect(200)
  const original = await f.db.clinicalEvolution.findUniqueOrThrow({
    where: { id: v.evolutionId },
  })
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await request(f.app)
    .get(`/v1/clinical/records/${v.patientId}`)
    .set('Authorization', token())
    .expect(404)
  await get(v.evolutionId).expect(200)
  const a = (await addendum(v.evolutionId.toUpperCase()).expect(201)).body
  addendumResponse.parse(a)
  assert.equal(a.originalEvolutionId, v.evolutionId)
  assert.equal(a.correctionText, '  Retificação fictícia preservada  ')
  const read = (await get(v.evolutionId).expect(200)).body
  assert.equal(read.addenda[0].addendumId, a.addendumId)
  assert.equal(read.contentHash, original.contentHash)
  assert.deepEqual(
    await f.db.clinicalEvolution.findUniqueOrThrow({
      where: { id: v.evolutionId },
    }),
    original,
  )
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        resourceId: v.evolutionId,
        action: 'evolution.finalized_read',
        authorizationBasis: `evolution_author:${v.evolutionId}`,
      },
    }),
  )
  await assert.rejects(
    f.db.evolutionAddendum.update({
      where: { id: a.addendumId },
      data: { contentEncrypted: 'changed' },
    }),
  )
  await assert.rejects(
    f.db.evolutionAddendum.delete({ where: { id: a.addendumId } }),
  )
})
test('BE-036: outro profissional requer vínculo/urgência e nunca adita original alheio', async () => {
  const v = await draft()
  await finalize(v.evolutionId).expect(200)
  await get(v.evolutionId, f.professionalAccounts[1].token).expect(404)
  await request(f.app)
    .post('/v1/clinical/emergency-access')
    .set('Authorization', f.professionalAccounts[1].token)
    .send({
      patientId: v.patientId,
      justification: 'Leitura excepcional fictícia',
    })
    .expect(201)
  await get(v.evolutionId, f.professionalAccounts[1].token).expect(200)
  await addendum(
    v.evolutionId,
    undefined,
    f.professionalAccounts[1].token,
  ).expect(403)
  await addendum(v.evolutionId, {
    reason: ' ',
    correctionText: 'Teste',
  }).expect(400)
  await addendum(v.evolutionId, {
    reason: 'Justificativa',
    correctionText: ' ',
  }).expect(400)
  for (const auth of [
    f.admin.token,
    f.reception.token,
    v.patient.token,
    (await f.account('manager')).token,
  ])
    await get(v.evolutionId, auth).expect(403)
  await finalize(v.evolutionId, 1, f.professionalAccounts[1].token).expect(403)
  await get(randomUUID()).expect(404)
})
test('BE-036: falha de auditoria reverte finalização, agenda, reserva, retenção e timeline', async () => {
  const v = await draft(),
    before = await f.db.careLink.findUniqueOrThrow({ where: { id: v.linkId } })
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_finalization_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='evolution.finalized' THEN RAISE EXCEPTION 'test finalization audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_finalization_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_finalization_audit()',
  )
  try {
    await finalize(v.evolutionId).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_finalization_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_finalization_audit()')
  }
  assert.equal(
    (
      await f.db.clinicalEvolution.findUniqueOrThrow({
        where: { id: v.evolutionId },
      })
    ).status,
    'draft',
  )
  assert.equal(
    (
      await f.db.clinicalEncounter.findUniqueOrThrow({
        where: { id: v.encounterId },
      })
    ).status,
    'in_progress',
  )
  assert.equal(
    (
      await f.db.appointment.findUniqueOrThrow({
        where: { id: v.appointmentId },
      })
    ).status,
    'in_service',
  )
  assert.equal(
    await f.db.slotReservation.count({
      where: { appointmentId: v.appointmentId, state: 'confirmed' },
    }),
    1,
  )
  assert.equal(
    await f.db.clinicalRetentionEvent.count({
      where: { encounterId: v.encounterId },
    }),
    0,
  )
  assert.equal(
    await f.db.clinicalTimelineEntry.count({
      where: { resourceId: v.evolutionId },
    }),
    0,
  )
  assert.equal(
    await f.db.slotReleaseEvent.count({
      where: { appointmentId: v.appointmentId },
    }),
    0,
  )
  assert.equal(
    (
      await f.db.careLink.findUniqueOrThrow({ where: { id: v.linkId } })
    ).endsAt.toISOString(),
    before.endsAt.toISOString(),
  )
  await finalize(v.evolutionId).expect(200)
})
test('BE-036: arquivos existentes congelam, download verifica bytes e não aceita troca de ciphertext válido', async () => {
  const v = await draft(),
    attached = await attach(v.evolutionId, v.patientId)
  await finalize(v.evolutionId).expect(200)
  const read = (await get(v.evolutionId).expect(200)).body
  assert.equal(read.attachments[0].sha256, attached.file.sha256)
  await assert.rejects(
    f.db.fileObject.update({
      where: { id: attached.file.id },
      data: { revokedAt: new Date() },
    }),
  )
  await assert.rejects(
    f.db.fileObject.delete({ where: { id: attached.file.id } }),
  )
  await assert.rejects(attach(v.evolutionId, v.patientId))
  const link = (
    await request(f.app)
      .post(`/v1/files/${attached.file.id}/download-link`)
      .set('Authorization', token())
      .expect(200)
  ).body
  assert.deepEqual(
    (
      await request(f.app)
        .get(link.url)
        .set('Authorization', token())
        .expect(200)
    ).body,
    attached.pdf,
  )
  const event = await f.db.auditEvent.findFirstOrThrow({
    where: { resourceId: attached.file.id, action: 'file.downloaded' },
  })
  assert.equal(event.authorizationBasis, `evolution_author:${v.evolutionId}`)
  await request(f.app)
    .post(`/v1/files/${attached.file.id}/download-link`)
    .set('Authorization', f.admin.token)
    .expect(404)
  const path = join(
      f.config.fileStoragePath,
      'attachment',
      attached.file.storageKey,
    ),
    original = await readFile(path),
    other = await attached.storage.write(
      'attachment',
      Readable.from([
        Buffer.concat([attached.pdf, Buffer.from('\nArquivo diferente')]),
      ]),
      f.config.fileAttachmentMaxMb * 1024 * 1024,
    )
  try {
    await copyFile(
      join(f.config.fileStoragePath, 'attachment', other.storageKey),
      path,
    )
    await request(f.app).get(link.url).set('Authorization', token()).expect(500)
  } finally {
    await writeFile(path, original)
    await attached.storage.remove('attachment', other.storageKey)
  }
  const files = f.scope.resolve<ManageFiles>(services.manageFiles)
  await new ConsentEvidenceReconciler(
    f.db,
    files,
    f.config.fileOrphanReconcileMinutes,
    () =>
      new Date(Date.now() + (f.config.fileOrphanReconcileMinutes + 1) * 60000),
  ).runOnce()
  assert.deepEqual(
    (
      await request(f.app)
        .get(link.url)
        .set('Authorization', token())
        .expect(200)
    ).body,
    attached.pdf,
  )
})
test('BE-036: hash incorreto em restauração simulada é negado antes de exibir conteúdo', async () => {
  const v = await draft()
  const attached = await attach(v.evolutionId, v.patientId)
  await finalize(v.evolutionId).expect(200)
  const original = await f.db.clinicalEvolution.findUniqueOrThrow({
      where: { id: v.evolutionId },
    }),
    box = new AesSecretBox(f.config.encryptionKey, 'clinical-evolution'),
    payload = JSON.parse(
      box.open(
        original.payloadEncrypted,
        `clinical_evolution:${v.evolutionId}`,
      ),
    )
  await f.db.$executeRawUnsafe(
    'ALTER TABLE "ClinicalEvolution" DISABLE TRIGGER "ClinicalEvolution_integrity"',
  )
  try {
    await f.db.clinicalEvolution.update({
      where: { id: v.evolutionId },
      data: {
        payloadEncrypted: box.seal(
          JSON.stringify({
            ...payload,
            complaint: 'Texto de restauração inconsistente',
          }),
          `clinical_evolution:${v.evolutionId}`,
        ),
      },
    })
  } finally {
    await f.db.$executeRawUnsafe(
      'ALTER TABLE "ClinicalEvolution" ENABLE TRIGGER "ClinicalEvolution_integrity"',
    )
  }
  try {
    const response = await get(v.evolutionId).expect(503)
    await request(f.app)
      .post(`/v1/files/${attached.file.id}/download-link`)
      .set('Authorization', token())
      .expect(503)
    assert.ok(!JSON.stringify(response.body).includes('Texto de restauração'))
    assert.ok(
      await f.db.auditEvent.findFirst({
        where: {
          resourceId: v.evolutionId,
          action: 'clinical.integrity_failed',
        },
      }),
    )
  } finally {
    await f.db.$executeRawUnsafe(
      'ALTER TABLE "ClinicalEvolution" DISABLE TRIGGER "ClinicalEvolution_integrity"',
    )
    try {
      await f.db.clinicalEvolution.update({
        where: { id: v.evolutionId },
        data: { payloadEncrypted: original.payloadEncrypted },
      })
    } finally {
      await f.db.$executeRawUnsafe(
        'ALTER TABLE "ClinicalEvolution" ENABLE TRIGGER "ClinicalEvolution_integrity"',
      )
    }
  }
  await get(v.evolutionId).expect(200)
})
test('BE-036: configurações usam Zod, mínimo de retenção não pode diminuir e política é única', async () => {
  const env = {
    DATABASE_URL: f.config.databaseUrl,
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: f.config.jwtSecret,
    FILE_ENCRYPTION_KEY: f.config.encryptionKey.toString('base64'),
  }
  assert.throws(() => loadConfig({ ...env, CLINICAL_RETENTION_YEARS: '19' }))
  assert.throws(() =>
    loadConfig({ ...env, EVOLUTION_REQUIRED_FIELDS: '["invalid"]' }),
  )
  const config = loadConfig({
      ...env,
      EVOLUTION_REQUIRED_FIELDS: '["complaint","history","conduct"]',
      CLINICAL_RETENTION_YEARS: String(f.config.clinicalRetentionYears + 1),
    }),
    runtime = await composeBackendApplication({
      ...f.config,
      evolutionRequiredFields: config.evolutionRequiredFields,
      clinicalRetentionYears: config.clinicalRetentionYears,
    })
  try {
    const v = await draft(),
      policy = (
        await request(runtime.app)
          .get('/v1/clinical/evolution-policy')
          .set('Authorization', token())
          .expect(200)
      ).body
    assert.deepEqual(policy.requiredFields, config.evolutionRequiredFields)
    const error = await request(runtime.app)
      .post(`/v1/clinical/evolutions/${v.evolutionId}/finalize`)
      .set('Authorization', token())
      .send({ expectedDraftVersion: 1 })
      .expect(400)
    assert.ok(
      error.body.error.details.some(
        (d: { field: string }) => d.field === 'history',
      ),
    )
  } finally {
    await runtime.close()
  }
})
test('BE-036: registros de retenção imutáveis e prazo preservado mesmo em limpeza de arquivos', async () => {
  const v = await draft()
  await finalize(v.evolutionId).expect(200)
  const hold = await f.db.clinicalRetentionEvent.findUniqueOrThrow({
    where: { encounterId: v.encounterId },
  })
  await assert.rejects(
    f.db.clinicalRetentionEvent.delete({ where: { id: hold.id } }),
  )
  await assert.rejects(
    f.db.clinicalRetentionEvent.update({
      where: { id: hold.id },
      data: { retainUntil: new Date() },
    }),
  )
  await new ConsentEvidenceReconciler(
    f.db,
    f.scope.resolve<ManageFiles>(services.manageFiles),
    f.config.fileOrphanReconcileMinutes,
    () => hold.retainUntil,
  ).runOnce()
  assert.equal(
    (
      await f.db.clinicalEvolution.findUniqueOrThrow({
        where: { id: v.evolutionId },
      })
    ).status,
    'finalized',
  )
  await assert.rejects(
    f.db.$executeRawUnsafe('TRUNCATE TABLE "ClinicalEvolution" CASCADE'),
  )
  await assert.rejects(
    f.db.$executeRawUnsafe('TRUNCATE TABLE "ClinicalRetentionEvent"'),
  )
  await get(v.evolutionId).expect(200)
})
test('BE-036/034: diagnóstico finalizado preserva snapshot após mudança do catálogo', async () => {
  const v = await draft(undefined, {
    complaint: 'Queixa fictícia',
    conduct: 'Conduta fictícia',
    diagnosisCodes: [{ code: 'DEV-CID-001', version: f.cid.version }],
  })
  await finalize(v.evolutionId).expect(200)
  const before = (await get(v.evolutionId).expect(200)).body
  await f.scope.resolve<ManageTerminologies>(services.manageTerminologies).load(
    {
      ...f.cid,
      version: 'finalized-cid-2',
      entries: f.cid.entries.map((e: { description: string }, i: number) =>
        i ? e : { ...e, description: 'Descrição fictícia atualizada' },
      ),
    },
    { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'test' },
  )
  const after = (await get(v.evolutionId).expect(200)).body
  assert.deepEqual(after.diagnosisCodes, before.diagnosisCodes)
  assert.equal(after.contentHash, before.contentHash)
  assert.equal(after.diagnosisCodes[0].version, f.cid.version)
})
test('BE-036: lista própria paginada sem vínculo contém só finalizadas do autor/paciente', async () => {
  const p = await f.patient(),
    ids = []
  for (let i = 0; i < 31; i++) {
    const v = await draft(p)
    await finalize(v.evolutionId).expect(200)
    ids.push(v.evolutionId)
  }
  await f.db.careLink.updateMany({
    where: { patientId: p.patientId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  const first = (
    await request(f.app)
      .get('/v1/clinical/evolutions/mine')
      .query({ patientId: p.patientId })
      .set('Authorization', token())
      .expect(200)
  ).body
  authoredEvolutionResponse.parse(first)
  assert.equal(first.items.length, 30)
  const next = (
    await request(f.app)
      .get('/v1/clinical/evolutions/mine')
      .query({ patientId: p.patientId, cursor: first.nextCursor })
      .set('Authorization', token())
      .expect(200)
  ).body
  assert.equal(next.items.length, 1)
  assert.equal(
    new Set([...first.items, ...next.items].map((i) => i.evolutionId)).size,
    31,
  )
  assert.ok(
    first.items.every((i: { evolutionId: string }) =>
      ids.includes(i.evolutionId),
    ),
  )
  assert.equal(
    (
      await request(f.app)
        .get('/v1/clinical/evolutions/mine')
        .query({ patientId: p.patientId })
        .set('Authorization', f.professionalAccounts[1].token)
        .expect(200)
    ).body.items.length,
    0,
  )
  await request(f.app)
    .get('/v1/clinical/evolutions/mine')
    .query({ patientId: randomUUID(), cursor: first.nextCursor })
    .set('Authorization', token())
    .expect(404)
  await request(f.app)
    .get('/v1/clinical/evolutions/mine')
    .set('Authorization', token())
    .expect(400)
})
