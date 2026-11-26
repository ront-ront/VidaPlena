import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import {
  patientHistoryResponse,
  publicationReceipt,
  publishedDocumentResponse,
} from '../../src/shared/infra/http/contracts/patient-publications'
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
const publish = (
  patientId: string,
  resourceId: string,
  extra: object = {},
  token = auth(),
) =>
  request(f.app)
    .post('/v1/clinical/publications')
    .set('Authorization', token)
    .send({
      patientId,
      resourceId,
      resourceType: 'ClinicalDocument',
      visibilityKind: 'document',
      reviewedForPatient: true,
      ...extra,
    })
const history = (patientId: string, token: string, query = '') =>
  request(f.app)
    .get(`/v1/me/clinical-history?patientId=${patientId}${query}`)
    .set('Authorization', token)
const detail = (id: string, token: string) =>
  request(f.app)
    .get(`/v1/me/clinical-documents/${id}`)
    .set('Authorization', token)
const revoke = (id: string, token = auth()) =>
  request(f.app)
    .post(`/v1/clinical/publications/${id}/revoke`)
    .set('Authorization', token)
    .send({ reason: 'Retirada fictícia para revisão' })
async function document(typeCode = 'report') {
  const v = await f.visit()
  const d = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/documents/drafts`)
      .set('Authorization', auth())
      .send({
        typeCode,
        payload: {
          templateVersion: '1',
          body: 'Documento fictício revisado para o paciente.',
        },
      })
      .expect(201)
  ).body
  const issued = (
    await request(f.app)
      .post(`/v1/clinical/documents/${d.documentId}/issue`)
      .set('Authorization', auth())
      .send({ expectedVersion: 1 })
      .expect(200)
  ).body
  return { ...v, issued }
}
test('BE-043: documento fica oculto até publicação explícita; allowlist dev, arquivo e auditoria', async () => {
  const v = await document()
  assert.deepEqual(
    (await history(v.patientId, v.patient.token).expect(200)).body.items,
    [],
  )
  await detail(v.issued.documentId, v.patient.token).expect(404)
  await request(f.app)
    .post(`/v1/files/${v.issued.files[0].id}/download-link`)
    .set('Authorization', v.patient.token)
    .expect(404)
  const p = (await publish(v.patientId, v.issued.documentId).expect(201)).body
  publicationReceipt.parse(p)
  const page = (await history(v.patientId, v.patient.token).expect(200)).body
  patientHistoryResponse.parse(page)
  assert.equal(page.items.length, 1)
  const d = (await detail(p.publicationId, v.patient.token).expect(200)).body
  publishedDocumentResponse.parse(d)
  assert.equal(d.signatureStatus, 'issued_dev')
  assert.equal(d.legalValidity, false)
  assert.equal(d.seal, 'sem validade jurídica')
  for (const key of [
    'payload',
    'complaint',
    'history',
    'physicalExam',
    'diagnosticHypotheses',
    'conduct',
    'justification',
    'canonical',
    'signature',
  ])
    assert.equal(key in d, false)
  const link = (
    await request(f.app)
      .post(`/v1/files/${d.files[0].id}/download-link`)
      .set('Authorization', v.patient.token)
      .expect(200)
  ).body
  await request(f.app)
    .get(link.url)
    .set('Authorization', v.patient.token)
    .expect(200)
  assert.ok(
    (await f.db.auditEvent.count({
      where: {
        resourceId: d.files[0].id,
        action: 'file.downloaded',
        authorizationBasis: `patient_publication:${p.publicationId}`,
      },
    })) > 0,
  )
})
test('BE-043: revogar bloqueia ID e link já emitido, preserva original e permite nova publicação', async () => {
  const v = await document(),
    p = (await publish(v.patientId, v.issued.documentId).expect(201)).body
  const link = (
    await request(f.app)
      .post(`/v1/files/${v.issued.files[0].id}/download-link`)
      .set('Authorization', v.patient.token)
      .expect(200)
  ).body
  await revoke(p.publicationId).expect(200)
  await revoke(p.publicationId).expect(409)
  await detail(p.publicationId, v.patient.token).expect(404)
  await request(f.app)
    .get(link.url)
    .set('Authorization', v.patient.token)
    .expect(404)
  assert.equal(
    (await history(v.patientId, v.patient.token).expect(200)).body.items.length,
    0,
  )
  assert.equal(
    (
      await f.db.clinicalDocument.findUniqueOrThrow({
        where: { id: v.issued.documentId },
      })
    ).sha256,
    v.issued.sha256,
  )
  const next = (await publish(v.patientId, v.issued.documentId).expect(201))
    .body
  assert.notEqual(next.publicationId, p.publicationId)
  await assert.rejects(
    f.db.patientPublication.delete({ where: { id: p.publicationId } }),
  )
  await assert.rejects(
    f.db.patientPublication.update({
      where: { id: next.publicationId },
      data: { resourceId: randomUUID() },
    }),
  )
})
test('BE-043: resultado enviado pelo paciente exige liberação clínica antes de download', async () => {
  const v = await f.visit(),
    pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
  const result = (
    await request(f.app)
      .post('/v1/clinical/exam-results')
      .set('Authorization', v.patient.token)
      .field(
        'data',
        JSON.stringify({ patientId: v.patientId, origin: 'external' }),
      )
      .attach('resultFile', pdf, 'resultado.pdf')
      .expect(201)
  ).body
  await request(f.app)
    .post(`/v1/files/${result.fileId}/download-link`)
    .set('Authorization', v.patient.token)
    .expect(404)
  const p = (
    await publish(v.patientId, result.resultId, {
      resourceType: 'ExamResult',
      visibilityKind: 'result',
    }).expect(201)
  ).body
  const d = (await detail(p.publicationId, v.patient.token).expect(200)).body
  assert.equal(d.origin, 'external')
  assert.equal(d.signatureStatus, 'not_signed')
  const link = (
    await request(f.app)
      .post(`/v1/files/${result.fileId}/download-link`)
      .set('Authorization', v.patient.token)
      .expect(200)
  ).body
  await request(f.app)
    .get(link.url)
    .set('Authorization', v.patient.token)
    .expect(200)
})
test('BE-043: orientação/resumo são projeções próprias; hipótese e CID não confirmado não são publicados', async () => {
  const v = await f.visit(),
    code = f.cid.entries[0].code,
    version = f.cid.version
  const evolution = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/evolutions/draft`)
      .set('Authorization', auth())
      .send({
        complaint: 'Queixa interna reservada',
        history: 'História interna reservada',
        physicalExam: 'Exame interno reservado',
        diagnosticHypotheses: 'Hipótese interna não confirmada',
        conduct: 'Conduta interna reservada',
        diagnosisCodes: [{ code, version }],
      })
      .expect(201)
  ).body
  const base = {
    resourceType: 'ClinicalEvolution',
    visibilityKind: 'orientation',
    projection: { text: 'Orientação fictícia revisada.' },
  }
  await publish(v.patientId, evolution.evolutionId, base).expect(400)
  await request(f.app)
    .post(`/v1/clinical/evolutions/${evolution.evolutionId}/finalize`)
    .set('Authorization', auth())
    .send({ expectedDraftVersion: 1 })
    .expect(200)
  await publish(v.patientId, evolution.evolutionId, base).expect(201)
  await publish(v.patientId, evolution.evolutionId, {
    resourceType: 'ClinicalEvolution',
    visibilityKind: 'confirmed_summary',
    projection: {
      text: 'Texto',
      diagnosisConfirmed: false,
      diagnosisCodes: [{ code, version }],
    },
  }).expect(400)
  await publish(v.patientId, evolution.evolutionId, {
    resourceType: 'ClinicalEvolution',
    visibilityKind: 'confirmed_summary',
    projection: {
      text: 'Texto',
      diagnosisConfirmed: true,
      diagnosisCodes: [{ code: 'OUTRO', version }],
    },
  }).expect(400)
  await publish(v.patientId, evolution.evolutionId, {
    resourceType: 'ClinicalEvolution',
    visibilityKind: 'confirmed_summary',
    projection: {
      text: 'Texto',
      diagnosisConfirmed: true,
      diagnosticHypotheses: 'Hipótese',
      diagnosisCodes: [{ code, version }],
    },
  }).expect(400)
  await publish(v.patientId, evolution.evolutionId, {
    resourceType: 'ClinicalEvolution',
    visibilityKind: 'confirmed_summary',
    projection: {
      text: 'Resumo confirmado fictício.',
      diagnosisConfirmed: true,
      diagnosisCodes: [{ code, version }],
    },
  }).expect(201)
  const page = (await history(v.patientId, v.patient.token).expect(200)).body
  patientHistoryResponse.parse(page)
  const serialized = JSON.stringify(page)
  for (const secret of [
    'Queixa interna reservada',
    'História interna reservada',
    'Exame interno reservado',
    'Hipótese interna não confirmada',
    'Conduta interna reservada',
  ])
    assert.equal(serialized.includes(secret), false)
  assert.equal(page.items.length, 2)
  assert.equal(
    page.items.find((i: { type: string }) => i.type === 'confirmed_summary')
      .confirmedSummary.diagnoses[0].code,
    code,
  )
  const stored = await f.db.patientPublication.findFirstOrThrow({
    where: { resourceId: evolution.evolutionId, visibilityKind: 'orientation' },
  })
  assert.equal(stored.projectionEncrypted?.includes('Orientação'), false)
})
test('BE-043: responsável lê só dependente ativo; fim do vínculo e revogação bloqueiam URL manipulada', async () => {
  const v = await document(),
    p = (await publish(v.patientId, v.issued.documentId).expect(201)).body,
    parent = await f.patient(),
    other = await f.patient()
  await history(v.patientId, other.token).expect(404)
  await detail(p.publicationId, other.token).expect(404)
  const guardian = await f.db.guardianLink.create({
    data: {
      guardianUserId: parent.user.id,
      patientId: v.patientId,
      relationship: 'responsável',
    },
  })
  assert.equal(
    (await history(v.patientId, parent.token).expect(200)).body.items.length,
    1,
  )
  const d = (await detail(p.publicationId, parent.token).expect(200)).body
  const link = (
    await request(f.app)
      .post(`/v1/files/${d.files[0].id}/download-link`)
      .set('Authorization', parent.token)
      .expect(200)
  ).body
  await f.db.guardianLink.update({
    where: { id: guardian.id },
    data: { status: 'ended', endedAt: new Date() },
  })
  await history(v.patientId, parent.token).expect(404)
  await request(f.app)
    .get(link.url)
    .set('Authorization', parent.token)
    .expect(404)
  await f.db.guardianLink.update({
    where: { id: guardian.id },
    data: { status: 'active', endedAt: null },
  })
  await request(f.app)
    .post('/v1/me/consents/revoke')
    .set('Authorization', v.patient.token)
    .send({ patientId: v.patientId, versionId: f.documentId })
    .expect(201)
  await history(v.patientId, parent.token).expect(403)
  await history(v.patientId, v.patient.token).expect(401)
  await request(f.app)
    .get(link.url)
    .set('Authorization', parent.token)
    .expect(404)
  await revoke(p.publicationId).expect(200)
  assert.ok(
    await f.db.clinicalDocument.findUnique({
      where: { id: v.issued.documentId },
    }),
  )
})
test('BE-043: anulação aparece no portal sem revelar razão ou alterar arquivo original', async () => {
  const v = await document(),
    p = (await publish(v.patientId, v.issued.documentId).expect(201)).body
  await request(f.app)
    .post(`/v1/clinical/documents/${v.issued.documentId}/void`)
    .set('Authorization', auth())
    .send({ reason: 'Motivo interno reservado da correção' })
    .expect(200)
  const d = (await detail(p.publicationId, v.patient.token).expect(200)).body
  publishedDocumentResponse.parse(d)
  assert.equal(d.signatureStatus, 'voided')
  assert.equal(d.legalValidity, false)
  assert.equal(d.seal, 'sem validade jurídica')
  assert.ok(d.voidedAt)
  assert.equal(JSON.stringify(d).includes('Motivo interno reservado'), false)
  assert.deepEqual(d.files, v.issued.files)
  const page = (await history(v.patientId, v.patient.token).expect(200)).body
  assert.equal(page.items[0].publishedDocument.signatureStatus, 'voided')
})
test('BE-043: somente autor vinculado publica documento; urgência e papéis administrativos não autorizam', async () => {
  const v = await document()
  for (const token of [f.admin.token, f.reception.token, v.patient.token])
    await publish(v.patientId, v.issued.documentId, {}, token).expect(403)
  await publish(
    v.patientId,
    v.issued.documentId,
    {},
    f.professionalAccounts[1].token,
  ).expect(404)
  await request(f.app)
    .post('/v1/clinical/emergency-access')
    .set('Authorization', f.professionalAccounts[1].token)
    .send({
      patientId: v.patientId,
      justification: 'Avaliação urgente fictícia',
    })
    .expect(201)
  await publish(
    v.patientId,
    v.issued.documentId,
    {},
    f.professionalAccounts[1].token,
  ).expect(404)
  await publish(v.patientId, v.issued.documentId, {
    reviewedForPatient: false,
  }).expect(400)
  await publish(v.patientId, v.issued.documentId, {
    projection: { text: 'Campo indevido' },
  }).expect(400)
  await publish(v.patientId, v.issued.documentId, {
    resourceType: 'ImportedHistory',
    visibilityKind: 'document',
  }).expect(400)
  const p = (await publish(v.patientId, v.issued.documentId).expect(201)).body
  await revoke(p.publicationId, f.professionalAccounts[1].token).expect(404)
  await request(f.app)
    .post('/v1/clinical/care-links/share')
    .set('Authorization', auth())
    .send({
      patientId: v.patientId,
      targetProfessionalId: f.professionalIds[1],
      reason: 'Compartilhamento clínico fictício',
      endsAt: new Date(Date.now() + 60000).toISOString(),
    })
    .expect(201)
  await publish(
    v.patientId,
    v.issued.documentId,
    {},
    f.professionalAccounts[1].token,
  ).expect(403)
  await revoke(p.publicationId, f.professionalAccounts[1].token).expect(403)
  const list = (
    await request(f.app)
      .get(`/v1/clinical/records/${v.patientId}/publications`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  assert.equal(list.items[0].publicationId, p.publicationId)
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await revoke(p.publicationId).expect(404)
  await detail(p.publicationId, v.patient.token).expect(200)
})
test('BE-043: concorrência publica uma só vez e falha de auditoria não deixa publicação parcial', async () => {
  const v = await document(),
    out = await Promise.all([
      publish(v.patientId, v.issued.documentId),
      publish(v.patientId, v.issued.documentId),
    ])
  assert.deepEqual(out.map((r) => r.status).sort(), [201, 409])
  const p = out.find((r) => r.status === 201)?.body
  await revoke(p.publicationId).expect(200)
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_publication_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='publication.created' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_publication_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_publication_audit()',
  )
  try {
    await publish(v.patientId, v.issued.documentId).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_publication_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_publication_audit()')
  }
  assert.equal(
    await f.db.patientPublication.count({
      where: { resourceId: v.issued.documentId, revokedAt: null },
    }),
    0,
  )
  assert.equal(
    (await history(v.patientId, v.patient.token).expect(200)).body.items.length,
    0,
  )
  await publish(v.patientId, v.issued.documentId).expect(201)
})
test('BE-043: resultados paginam com filtros/cursor escopados e revogados não entram', async () => {
  const v = await f.visit(),
    pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
  for (let i = 0; i < 31; i++) {
    const result = (
      await request(f.app)
        .post('/v1/clinical/exam-results')
        .set('Authorization', v.patient.token)
        .field(
          'data',
          JSON.stringify({ patientId: v.patientId, origin: 'external' }),
        )
        .attach('resultFile', pdf, 'resultado.pdf')
        .expect(201)
    ).body
    await publish(v.patientId, result.resultId, {
      resourceType: 'ExamResult',
      visibilityKind: 'result',
    }).expect(201)
  }
  const page = (
    await history(v.patientId, v.patient.token, '&type=exam_result').expect(200)
  ).body
  assert.equal(page.items.length, 30)
  assert.ok(page.nextCursor)
  const next = (
    await history(
      v.patientId,
      v.patient.token,
      `&type=exam_result&cursor=${page.nextCursor}`,
    ).expect(200)
  ).body
  assert.equal(next.items.length, 1)
  assert.equal(next.nextCursor, null)
  assert.ok(!page.items.some((i: { id: string }) => i.id === next.items[0].id))
  await history(
    v.patientId,
    v.patient.token,
    `&type=document&cursor=${page.nextCursor}`,
  ).expect(404)
  const other = await f.patient()
  await history(
    other.patientId,
    other.token,
    `&cursor=${page.nextCursor}`,
  ).expect(404)
  assert.equal(
    (
      await history(
        v.patientId,
        v.patient.token,
        `&specialtyId=${f.specialtyId}`,
      ).expect(200)
    ).body.items.length,
    0,
  )
  assert.equal(
    (
      await history(
        v.patientId,
        v.patient.token,
        '&from=2000-01-01T00:00:00Z&to=2001-01-01T00:00:00Z',
      ).expect(200)
    ).body.items.length,
    0,
  )
  await revoke(page.nextCursor).expect(200)
  await history(
    v.patientId,
    v.patient.token,
    `&cursor=${page.nextCursor}`,
  ).expect(404)
  assert.equal(
    (await history(v.patientId, v.patient.token).expect(200)).body.items.length,
    30,
  )
  const spec = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(spec.paths['/me/clinical-history'].get)
  assert.ok(
    spec.paths['/clinical/publications'].post.requestBody.content[
      'application/json'
    ],
  )
})
test('BE-043: prescrição e pedido publicados preservam tipo e draft não é elegível', async () => {
  const v = await f.visit()
  const bodies = [
    {
      typeCode: 'prescription',
      payload: {
        items: [
          {
            name: 'Medicamento fictício',
            dose: 'Dose fictícia',
            route: 'Via fictícia',
            frequency: 'Frequência fictícia',
            quantity: 'Quantidade fictícia',
            instructions: 'Instrução fictícia',
          },
        ],
      },
    },
    {
      typeCode: 'exam_order',
      payload: {
        privateVisit: true,
        exams: [
          {
            description: 'Exame fictício',
            indication: 'Indicação explicitamente revisada para o paciente',
          },
        ],
      },
    },
  ]
  for (const body of bodies) {
    const d = (
      await request(f.app)
        .post(`/v1/clinical/encounters/${v.encounterId}/documents/drafts`)
        .set('Authorization', auth())
        .send(body)
        .expect(201)
    ).body
    await publish(v.patientId, d.documentId).expect(400)
    await request(f.app)
      .post(`/v1/clinical/documents/${d.documentId}/issue`)
      .set('Authorization', auth())
      .send({ expectedVersion: 1 })
      .expect(200)
    const p = (await publish(v.patientId, d.documentId).expect(201)).body
    assert.equal(
      (await detail(p.publicationId, v.patient.token).expect(200)).body.type,
      body.typeCode,
    )
    const page = (
      await history(
        v.patientId,
        v.patient.token,
        `&type=${body.typeCode}`,
      ).expect(200)
    ).body
    assert.equal(page.items.length, 1)
    assert.equal(page.items[0].type, body.typeCode)
    assert.ok(page.items[0].importedOrigin)
  }
})
