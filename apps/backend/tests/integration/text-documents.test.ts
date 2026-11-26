import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import request from 'supertest'
import type { ManageFiles } from '../../src/application/use-cases/manage-files'
import { textDocumentCodes } from '../../src/application/validation/text-document'
import { services } from '../../src/shared/composition/container'
import { composeBackendApplication } from '../../src/shared/composition/root'
import {
  clinicalDocumentResponse,
  publicDocumentVerificationResponse,
} from '../../src/shared/infra/http/contracts/clinical-documents'
import { documentContextResponse } from '../../src/shared/infra/http/contracts/text-documents'
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
const auth = () => f.professionalAccounts[0].token
const create = (
  encounterId: string,
  typeCode = 'certificate',
  payload: unknown = {
    templateVersion: '1',
    body: '  Conteúdo fictício escrito pelo profissional.\nSegunda linha preservada.  ',
  },
  app = f.app,
) =>
  request(app)
    .post(`/v1/clinical/encounters/${encounterId}/documents/drafts`)
    .set('Authorization', auth())
    .send({ typeCode, payload })
const issue = (id: string, expectedVersion = 1, app = f.app) =>
  request(app)
    .post(`/v1/clinical/documents/${id}/issue`)
    .set('Authorization', auth())
    .send({ expectedVersion })
const context = (
  encounterId: string,
  typeCode = 'certificate',
  token = auth(),
) =>
  request(f.app)
    .get(
      `/v1/clinical/encounters/${encounterId}/document-context?typeCode=${typeCode}`,
    )
    .set('Authorization', token)
const patch = (id: string, payload: unknown, expectedVersion = 1) =>
  request(f.app)
    .patch(`/v1/clinical/documents/${id}/draft`)
    .set('Authorization', auth())
    .send({ payload, expectedVersion })
async function complete(encounterId: string) {
  const draft = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${encounterId}/evolutions/draft`)
      .set('Authorization', auth())
      .send({ complaint: 'Queixa fictícia', conduct: 'Conduta fictícia' })
      .expect(201)
  ).body
  await request(f.app)
    .post(`/v1/clinical/evolutions/${draft.evolutionId}/finalize`)
    .set('Authorization', auth())
    .send({ expectedDraftVersion: draft.draftVersion })
    .expect(200)
}
test('BE-042: quatro modelos vazios preenchem identificação/atendimento e geram PDF/assinatura/retensão sem publicar', async () => {
  const v = await f.visit()
  for (const code of textDocumentCodes) {
    const c = (await context(v.encounterId, code).expect(200)).body
    documentContextResponse.parse(c)
    assert.equal(c.patient.id, v.patientId)
    assert.equal(c.encounter.id, v.encounterId)
    assert.equal(c.signer.id, f.professionalIds[0])
    assert.deepEqual(c.initialPayload, { templateVersion: '1', body: '' })
    assert.equal(
      c.type.requiredSignatureLevel,
      code === 'declaration' ? 'simple' : 'qualified',
    )
    const draft = (await create(v.encounterId, code).expect(201)).body
    const issued = (await issue(draft.documentId).expect(200)).body
    clinicalDocumentResponse.parse(issued)
    assert.equal(issued.status, 'issued_dev')
    assert.equal(issued.signature.seal, 'sem validade jurídica')
    assert.equal(issued.signature.legalValidity, false)
    assert.equal(issued.requiredSignatureLevel, c.type.requiredSignatureLevel)
    assert.equal(issued.files.length, 1)
    const retained = await f.db.clinicalRetentionEvent.findUniqueOrThrow({
      where: { clinicalDocumentId: issued.documentId },
    })
    assert.equal(retained.anchorAt.toISOString(), issued.issuedAt)
    assert.equal(retained.retentionYears, f.config.clinicalRetentionYears)
    const stored = await f.db.fileObject.findUniqueOrThrow({
      where: { id: issued.files[0].id },
    })
    assert.equal(
      (
        await readFile(
          join(f.config.fileStoragePath, 'attachment', stored.storageKey),
        )
      ).includes(Buffer.from('%PDF')),
      false,
    )
    const link = (
      await request(f.app)
        .post(`/v1/files/${stored.id}/download-link`)
        .set('Authorization', auth())
        .expect(200)
    ).body
    await request(f.app).get(link.url).set('Authorization', auth()).expect(200)
    await request(f.app)
      .post(`/v1/files/${stored.id}/download-link`)
      .set('Authorization', v.patient.token)
      .expect(404)
  }
})
test('BE-042: emissão e correção pós-conclusão mantêm agenda/evolução encerradas e não liberam Rx/exames', async () => {
  const v = await f.visit(),
    before = (await create(v.encounterId).expect(201)).body
  await complete(v.encounterId)
  const c = (await context(v.encounterId).expect(200)).body
  assert.equal(c.encounter.status, 'completed')
  assert.ok(c.encounter.endedAt)
  await patch(before.documentId, {
    templateVersion: '1',
    body: 'Complemento fictício após o atendimento.',
  }).expect(200)
  const original = (await issue(before.documentId, 2).expect(200)).body
  const draft = (
    await create(v.encounterId, 'certificate', {
      templateVersion: '1',
      body: 'Retificação fictícia.',
    }).expect(201)
  ).body
  const replacement = (await issue(draft.documentId).expect(200)).body
  const voided = (
    await request(f.app)
      .post(`/v1/clinical/documents/${original.documentId}/void`)
      .set('Authorization', auth())
      .send({
        reason: 'Correção do texto fictício',
        replacementDocumentId: replacement.documentId,
      })
      .expect(200)
  ).body
  assert.equal(voided.status, 'voided')
  assert.equal(voided.sha256, original.sha256)
  assert.equal(voided.voidEvent.replacementDocumentId, replacement.documentId)
  assert.equal(
    (
      await f.db.clinicalEncounter.findUniqueOrThrow({
        where: { id: v.encounterId },
      })
    ).status,
    'completed',
  )
  assert.equal(
    (
      await f.db.appointment.findUniqueOrThrow({
        where: { id: v.appointmentId },
      })
    ).status,
    'completed',
  )
  await create(v.encounterId, 'exam_order', {
    privateVisit: true,
    exams: [{ description: 'Fictício', indication: 'Fictícia' }],
  }).expect(404)
  await create(v.encounterId, 'prescription', {
    items: [
      {
        name: 'Fictício',
        dose: 'Fictícia',
        route: 'Fictícia',
        frequency: 'Fictícia',
        quantity: 'Fictícia',
        instructions: '',
      },
    ],
  }).expect(404)
})
test('BE-042: rascunho vazio é preservado; conteúdo inválido/período/versão não emitem', async () => {
  const v = await f.visit(),
    empty = (
      await create(v.encounterId, 'report', {
        templateVersion: '1',
        body: '',
      }).expect(201)
    ).body
  await issue(empty.documentId).expect(400)
  assert.equal(
    (
      await f.db.clinicalDocument.findUniqueOrThrow({
        where: { id: empty.documentId },
      })
    ).status,
    'draft',
  )
  for (const payload of [
    { templateVersion: '2', body: 'Texto' },
    { templateVersion: '1', body: 'Texto', patientId: v.patientId },
    { templateVersion: '1', body: 'x'.repeat(20001) },
    {
      templateVersion: '1',
      body: 'Texto',
      period: {
        startsAt: '2026-11-26T12:00:00Z',
        endsAt: '2026-11-26T11:00:00Z',
      },
    },
  ])
    await create(v.encounterId, 'report', payload).expect(400)
  await patch(empty.documentId, {
    templateVersion: '1',
    body: 'Relatório fictício preenchido.',
    period: {
      startsAt: '2026-11-26T11:00:00Z',
      endsAt: '2026-11-26T12:00:00Z',
    },
  }).expect(200)
  await issue(empty.documentId, 1).expect(409)
  await issue(empty.documentId, 2).expect(200)
})
test('BE-042: provider indisponível mantém draft sem PDF/código/retenção', async () => {
  const v = await f.visit(),
    runtime = await composeBackendApplication(
      { ...f.config, signatureProvider: 'disabled' },
      f.db,
    )
  try {
    const d = (
      await create(
        v.encounterId,
        'declaration',
        { templateVersion: '1', body: 'Declaração fictícia' },
        runtime.app,
      ).expect(201)
    ).body
    await issue(d.documentId, 1, runtime.app).expect(503)
    const row = await f.db.clinicalDocument.findUniqueOrThrow({
      where: { id: d.documentId },
    })
    assert.equal(row.status, 'draft')
    assert.equal(row.sha256, null)
    assert.equal(
      await f.db.fileObject.count({
        where: { linkedResourceId: d.documentId },
      }),
      0,
    )
    assert.equal(
      await f.db.clinicalRetentionEvent.count({
        where: { clinicalDocumentId: d.documentId },
      }),
      0,
    )
  } finally {
    await runtime.close()
  }
})
test('BE-042: modelo/nível novos não reescrevem emitido; draft exige atualização explícita', async () => {
  const v = await f.visit(),
    original = (await create(v.encounterId, 'declaration').expect(201)).body,
    issued = (await issue(original.documentId).expect(200)).body,
    draft = (await create(v.encounterId, 'declaration').expect(201)).body
  const type = await f.db.documentType.findUniqueOrThrow({
    where: { code: 'declaration' },
  })
  await request(f.app)
    .put(`/v1/admin/document-types/${type.id}`)
    .set('Authorization', f.admin.token)
    .send({
      expectedVersion: 1,
      requiredSignatureLevel: 'qualified',
      templateVersion: '1',
      active: true,
      reason: 'Mudança técnica fictícia',
    })
    .expect(200)
  await issue(draft.documentId).expect(409)
  await patch(draft.documentId, {
    templateVersion: '1',
    body: 'Texto atualizado fictício.',
  }).expect(200)
  const newer = (await issue(draft.documentId, 2).expect(200)).body
  assert.equal(newer.requiredSignatureLevel, 'qualified')
  assert.equal(issued.requiredSignatureLevel, 'simple')
  const read = (
    await request(f.app)
      .get(`/v1/clinical/documents/${issued.documentId}`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  assert.equal(read.sha256, issued.sha256)
  assert.equal(read.requiredSignatureLevel, 'simple')
})
test('BE-042: código público verifica só metadados e emitido/anulação/retenção são imutáveis', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    r = (await issue(d.documentId).expect(200)).body
  const publicView = (
    await request(f.app)
      .get(`/v1/documents/verify/${r.verificationCode}`)
      .expect(200)
  ).body
  publicDocumentVerificationResponse.parse(publicView)
  assert.equal(publicView.legalValidity, false)
  for (const field of [
    'patientId',
    'body',
    'payload',
    'files',
    'encounterId',
    'verificationCode',
  ])
    assert.equal(field in publicView, false)
  await patch(d.documentId, {
    templateVersion: '1',
    body: 'Alteração indevida',
  }).expect(409)
  await assert.rejects(
    f.db.clinicalDocument.delete({ where: { id: d.documentId } }),
  )
  await assert.rejects(
    f.db.clinicalDocument.update({
      where: { id: d.documentId },
      data: { payloadEncrypted: 'trocado' },
    }),
  )
  const retention = await f.db.clinicalRetentionEvent.findUniqueOrThrow({
    where: { clinicalDocumentId: d.documentId },
  })
  await assert.rejects(
    f.db.clinicalRetentionEvent.delete({ where: { id: retention.id } }),
  )
  await request(f.app)
    .post(`/v1/clinical/documents/${d.documentId}/void`)
    .set('Authorization', auth())
    .send({ reason: 'Retificação fictícia' })
    .expect(200)
  const after = (
    await request(f.app)
      .get(`/v1/documents/verify/${r.verificationCode}`)
      .expect(200)
  ).body
  assert.equal(after.status, 'voided')
  assert.equal(after.sha256, r.sha256)
})
test('BE-042: sem autoria/vínculo atual, administradores, substitutos e urgência isolada não escrevem', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body
  for (const token of [
    f.admin.token,
    f.reception.token,
    v.patient.token,
    f.professionalAccounts[1].token,
  ]) {
    await context(v.encounterId, 'certificate', token).expect(
      token === f.professionalAccounts[1].token ? 404 : 403,
    )
  }
  const grant = (
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', f.professionalAccounts[1].token)
      .send({
        patientId: v.patientId,
        justification: 'Avaliação urgente fictícia',
      })
      .expect(201)
  ).body
  assert.ok(grant.grantId)
  await request(f.app)
    .post(`/v1/clinical/documents/${d.documentId}/issue`)
    .set('Authorization', f.professionalAccounts[1].token)
    .send({ expectedVersion: 1 })
    .expect(404)
  await complete(v.encounterId)
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await context(v.encounterId).expect(404)
  await issue(d.documentId).expect(404)
  assert.equal(
    (
      await f.db.clinicalDocument.findUniqueOrThrow({
        where: { id: d.documentId },
      })
    ).status,
    'draft',
  )
})
test('BE-042: falha de auditoria reverte PDF/retenção/emissão e mantém draft', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    count = await f.db.fileObject.count()
  const diskBefore = await readdir(
    join(f.config.fileStoragePath, 'attachment'),
  ).catch(() => [])
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_text_document_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='document.issued' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_text_document_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_text_document_audit()',
  )
  try {
    await issue(d.documentId).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_text_document_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_text_document_audit()')
  }
  assert.equal(await f.db.fileObject.count(), count)
  assert.deepEqual(
    await readdir(join(f.config.fileStoragePath, 'attachment')),
    diskBefore,
  )
  assert.equal(
    await f.db.clinicalRetentionEvent.count({
      where: { clinicalDocumentId: d.documentId },
    }),
    0,
  )
  assert.equal(
    (
      await f.db.clinicalDocument.findUniqueOrThrow({
        where: { id: d.documentId },
      })
    ).status,
    'draft',
  )
  assert.equal(
    await f.db.clinicalTimelineEntry.count({
      where: { resourceId: d.documentId },
    }),
    0,
  )
  await issue(d.documentId).expect(200)
})
test('BE-042: PDF longo mantém conteúdo e selo em várias páginas; modelo sem implementação fica fechado', async () => {
  const v = await f.visit(),
    body = Array.from(
      { length: 180 },
      (_, i) =>
        `${i + 1}. Linha clínica fictícia com acentos: atenção, evolução e orientação.`,
    ).join('\n'),
    d = (
      await create(v.encounterId, 'referral', {
        templateVersion: '1',
        body,
      }).expect(201)
    ).body,
    r = (await issue(d.documentId).expect(200)).body
  const files = f.scope.resolve<ManageFiles>(services.manageFiles),
    actor = f.principal(f.professionalAccounts[0], 'professional')
  const link = await files.downloadLink(actor, r.files[0].id, {
    requestId: randomUUID(),
    actorRoles: ['professional'],
    authorizationBasis: 'test',
  })
  const content = await files.download(
    actor,
    link.url.split('/').at(-1) as string,
    {
      requestId: randomUUID(),
      actorRoles: ['professional'],
      authorizationBasis: 'test',
    },
  )
  const chunks: Buffer[] = []
  for await (const chunk of content.stream) chunks.push(Buffer.from(chunk))
  const bytes = Buffer.concat(chunks),
    pdf = await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount() > 1)
  assert.match(pdf.getTitle() as string, /sem validade jurídica/)
  await writeFile('/tmp/vidaplena-be042-review.pdf', bytes)
  const type = await f.db.documentType.findUniqueOrThrow({
    where: { code: 'referral' },
  })
  await request(f.app)
    .put(`/v1/admin/document-types/${type.id}`)
    .set('Authorization', f.admin.token)
    .send({
      expectedVersion: 1,
      requiredSignatureLevel: 'qualified',
      templateVersion: '2',
      active: true,
      reason: 'Modelo fictício sem implementação',
    })
    .expect(200)
  await context(v.encounterId, 'referral').expect(503)
  await create(v.encounterId, 'referral', {
    templateVersion: '1',
    body: 'Texto',
  }).expect(503)
})
