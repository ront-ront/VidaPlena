import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import type { ManageTerminologies } from '../../src/application/use-cases/manage-terminologies'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { services } from '../../src/shared/composition/container'
import {
  evolutionDraftResponse,
  evolutionLookupResponse,
  evolutionSavedResponse,
} from '../../src/shared/infra/http/contracts/evolution-drafts'
import { errorResponse } from '../../src/shared/infra/http/contracts/m0'
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
const create = (
  id: string,
  body: Record<string, unknown> = {},
  auth = token(),
) =>
  request(f.app)
    .post(`/v1/clinical/encounters/${id}/evolutions/draft`)
    .set('Authorization', auth)
    .send(body)
const get = (id: string, auth = token()) =>
  request(f.app).get(`/v1/clinical/evolutions/${id}`).set('Authorization', auth)
const lookup = (id: string, auth = token()) =>
  request(f.app)
    .get(`/v1/clinical/encounters/${id}/evolutions/draft`)
    .set('Authorization', auth)
const patch = (
  id: string,
  body: Record<string, unknown>,
  key = randomUUID(),
  auth = token(),
) =>
  request(f.app)
    .patch(`/v1/clinical/evolutions/${id}/draft`)
    .set('Authorization', auth)
    .set('Idempotency-Key', key)
    .send(body)

test('BE-035: criação vazia/parcial e conteúdo literal cifrado com snapshot CID no mesmo registro', async () => {
  const v = await f.visit(),
    text = '  Texto clínico fictício\ncom acentuação e espaço final  '
  assert.deepEqual((await lookup(v.encounterId).expect(200)).body, {
    evolution: null,
  })
  const r = (
    await create(v.encounterId, {
      complaint: text,
      diagnosisCodes: [{ code: 'DEV-CID-001', version: f.cid.version }],
    }).expect(201)
  ).body
  evolutionSavedResponse.parse(r)
  assert.equal(r.draftVersion, 1)
  const output = await get(r.evolutionId).expect(200)
  evolutionDraftResponse.parse(output.body)
  assert.equal(output.body.complaint, text)
  assert.equal(output.body.history, '')
  assert.equal(
    output.body.diagnosisCodes[0].description,
    f.cid.entries[0].description,
  )
  assert.equal(output.body.diagnosisCodes[0].demo, true)
  assert.equal(output.headers['cache-control'], 'no-store')
  const record = await f.db.clinicalEvolution.findUniqueOrThrow({
    where: { id: r.evolutionId },
  })
  assert.ok(!record.payloadEncrypted.includes(text))
  assert.ok(
    !JSON.stringify(
      await f.db.auditEvent.findMany({ where: { resourceId: r.evolutionId } }),
    ).includes('Texto clínico fictício'),
  )
  const timeline = (
    await request(f.app)
      .get(`/v1/clinical/records/${v.patientId}/timeline`)
      .set('Authorization', token())
      .expect(200)
  ).body
  assert.ok(
    !timeline.items.some((i: { type: string }) => i.type === 'evolution'),
  )
})
test('BE-035: um draft por encontro sob criação concorrente, conflito sem conteúdo', async () => {
  const v = await f.visit(),
    results = await Promise.all([
      create(v.encounterId, { complaint: 'Primeiro texto confidencial' }),
      create(v.encounterId, { complaint: 'Segundo texto confidencial' }),
    ])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  const conflict = results.find((r) => r.status === 409)?.body
  errorResponse.parse(conflict)
  assert.ok(conflict.error.draftConflict.evolutionId)
  assert.ok(!JSON.stringify(conflict).includes('confidencial'))
  assert.equal(
    await f.db.clinicalEvolution.count({
      where: { encounterId: v.encounterId },
    }),
    1,
  )
})
test('BE-035: versão concorrente, replay exato e nonce com payload diferente', async () => {
  const v = await f.visit(),
    draft = (await create(v.encounterId).expect(201)).body,
    keys = [randomUUID(), randomUUID()],
    bodies = [
      { expectedDraftVersion: 1, complaint: 'Edição A' },
      { expectedDraftVersion: 1, complaint: 'Edição B' },
    ]
  const outcomes = await Promise.all(
    bodies.map((body, i) => patch(draft.evolutionId, body, keys[i])),
  )
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409])
  const winner = outcomes.findIndex((r) => r.status === 200),
    saved = outcomes[winner].body
  assert.equal(saved.draftVersion, 2)
  assert.deepEqual(
    (await patch(draft.evolutionId, bodies[winner], keys[winner]).expect(200))
      .body,
    saved,
  )
  const changed = await patch(
    draft.evolutionId,
    { expectedDraftVersion: 1, complaint: 'Outra edição' },
    keys[winner],
  ).expect(409)
  assert.equal(changed.body.error.draftConflict.currentDraftVersion, 2)
  await patch(draft.evolutionId, {
    expectedDraftVersion: 2,
    history: 'História fictícia posterior',
  }).expect(200)
  assert.deepEqual(
    (await patch(draft.evolutionId, bodies[winner], keys[winner]).expect(200))
      .body,
    saved,
  )
  assert.equal((await get(draft.evolutionId).expect(200)).body.draftVersion, 3)
  assert.equal(
    await f.db.evolutionDraftCommand.count({
      where: { evolutionId: draft.evolutionId },
    }),
    2,
  )
  const commands = await f.db.evolutionDraftCommand.findMany({
    where: { evolutionId: draft.evolutionId },
  })
  assert.ok(commands.every((c) => /^[a-f0-9]{64}$/.test(c.inputFingerprint)))
})
test('BE-035: nonce concorrente em evoluções diferentes não deixa gravação parcial', async () => {
  const old = await f.visit(undefined, true),
    current = await f.visit(),
    a = (await create(old.encounterId).expect(201)).body,
    b = (await create(current.encounterId).expect(201)).body,
    key = randomUUID()
  const results = await Promise.all([
    patch(
      a.evolutionId,
      { expectedDraftVersion: 1, complaint: 'Texto A' },
      key,
    ),
    patch(
      b.evolutionId,
      { expectedDraftVersion: 1, complaint: 'Texto B' },
      key,
    ),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const versions = await f.db.clinicalEvolution.findMany({
    where: { id: { in: [a.evolutionId, b.evolutionId] } },
    select: { draftVersion: true },
  })
  assert.deepEqual(versions.map((r) => r.draftVersion).sort(), [1, 2])
  assert.equal(
    await f.db.evolutionDraftCommand.count({ where: { requestKey: key } }),
    1,
  )
})
test('BE-035: sessão nova recupera último conteúdo, sessão revogada não acessa', async () => {
  const v = await f.visit(),
    draft = (
      await create(v.encounterId, {
        history: 'Conteúdo preservado após sessão',
      }).expect(201)
    ).body,
    account = f.professionalAccounts[0],
    oldToken = account.token
  await f.db.session.update({
    where: { id: account.session.id },
    data: { revokedAt: new Date() },
  })
  const session = await f.db.session.create({
    data: {
      userId: account.user.id,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
      mfaVerifiedAt: new Date(),
    },
  })
  const issued = await new JwtAccessTokens(f.config.jwtSecret).issue(
    { userId: account.user.id, sessionId: session.id },
    new Date(Date.now() + 600000),
  )
  f.professionalAccounts[0] = { ...account, session, token: `Bearer ${issued}` }
  await get(draft.evolutionId, oldToken).expect(401)
  const restored = (await lookup(v.encounterId).expect(200)).body
  evolutionLookupResponse.parse(restored)
  assert.equal(restored.evolution.history, 'Conteúdo preservado após sessão')
  assert.equal(restored.evolution.evolutionId, draft.evolutionId)
})
test('BE-035: papéis, autoria, perfil/MFA e vínculo protegem leitura/edição', async () => {
  const v = await f.visit(),
    draft = (
      await create(v.encounterId, { complaint: 'Rascunho privado' }).expect(201)
    ).body,
    manager = await f.account('manager')
  for (const auth of [
    f.admin.token,
    f.reception.token,
    manager.token,
    v.patient.token,
  ]) {
    await create(v.encounterId, {}, auth).expect(403)
    await get(draft.evolutionId, auth).expect(403)
  }
  const id = randomUUID()
  await f.db.careLink.create({
    data: {
      id,
      patientId: v.patientId,
      professionalId: f.professionalIds[1],
      source: 'substitution',
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3600000),
      grantedBy: manager.user.id,
      reasonEncrypted: new AesSecretBox(
        f.config.encryptionKey,
        'care-link',
      ).seal('Cobertura fictícia', `care_link:${id}`),
    },
  })
  await request(f.app)
    .get(`/v1/clinical/records/${v.patientId}`)
    .set('Authorization', f.professionalAccounts[1].token)
    .expect(200)
  await get(draft.evolutionId, f.professionalAccounts[1].token).expect(404)
  await patch(
    draft.evolutionId,
    { expectedDraftVersion: 1, complaint: 'Outro autor' },
    randomUUID(),
    f.professionalAccounts[1].token,
  ).expect(404)
  await get(randomUUID()).expect(404)
  await f.db.professionalProfile.update({
    where: { id: f.professionalIds[0] },
    data: { active: false },
  })
  try {
    await get(draft.evolutionId).expect(403)
  } finally {
    await f.db.professionalProfile.update({
      where: { id: f.professionalIds[0] },
      data: { active: true },
    })
  }
  await f.db.session.update({
    where: { id: f.professionalAccounts[0].session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await get(draft.evolutionId).expect(401)
  } finally {
    await f.db.session.update({
      where: { id: f.professionalAccounts[0].session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
})
test('BE-035/034: seleção CID inválida falha, atualização não recodifica diagnóstico persistido', async () => {
  const v = await f.visit()
  for (const code of ['INVALID', 'DEV-CID-004'])
    await create(v.encounterId, {
      diagnosisCodes: [{ code, version: f.cid.version }],
    }).expect(400)
  assert.equal(
    await f.db.clinicalEvolution.count({
      where: { encounterId: v.encounterId },
    }),
    0,
  )
  const draft = (
    await create(v.encounterId, {
      diagnosisCodes: [{ code: 'DEV-CID-001', version: f.cid.version }],
    }).expect(201)
  ).body
  await f.scope.resolve<ManageTerminologies>(services.manageTerminologies).load(
    {
      ...f.cid,
      version: 'draft-test-2',
      entries: f.cid.entries.map((e: { description: string }, i: number) =>
        i ? e : { ...e, description: 'Nova descrição fictícia' },
      ),
    },
    { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'test' },
  )
  await patch(draft.evolutionId, {
    expectedDraftVersion: 1,
    complaint: 'Texto sem trocar diagnóstico',
  }).expect(200)
  assert.equal(
    (await get(draft.evolutionId).expect(200)).body.diagnosisCodes[0].version,
    f.cid.version,
  )
  await patch(draft.evolutionId, {
    expectedDraftVersion: 2,
    diagnosisCodes: [{ code: 'DEV-CID-001', version: f.cid.version }],
  }).expect(409)
  await patch(draft.evolutionId, {
    expectedDraftVersion: 2,
    diagnosisCodes: [{ code: 'DEV-CID-001', version: 'draft-test-2' }],
  }).expect(200)
  assert.equal(
    (await get(draft.evolutionId).expect(200)).body.diagnosisCodes[0]
      .description,
    'Nova descrição fictícia',
  )
})
test('BE-035: vínculo de nova consulta recupera, mas não edita encontro antigo expirado', async () => {
  const old = await f.visit(undefined, true),
    draft = (
      await create(old.encounterId, {
        complaint: 'Texto do encontro antigo',
      }).expect(201)
    ).body
  await f.db.careLink.update({
    where: { id: old.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await get(draft.evolutionId).expect(404)
  const next = await f.visit(old.patient)
  assert.notEqual(next.linkId, old.linkId)
  await get(draft.evolutionId).expect(200)
  await patch(draft.evolutionId, {
    expectedDraftVersion: 1,
    complaint: 'Escrita indevida',
  }).expect(404)
  assert.equal(
    (await get(draft.evolutionId).expect(200)).body.complaint,
    'Texto do encontro antigo',
  )
})
test('BE-035: urgência não abre draft, mesmo para autor sem vínculo', async () => {
  const v = await f.visit(),
    draft = (await create(v.encounterId).expect(201)).body
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await request(f.app)
    .post('/v1/clinical/emergency-access')
    .set('Authorization', token())
    .send({
      patientId: v.patientId,
      justification: 'Acesso excepcional fictício',
    })
    .expect(201)
  await request(f.app)
    .get(`/v1/clinical/records/${v.patientId}`)
    .set('Authorization', token())
    .expect(200)
  await get(draft.evolutionId).expect(404)
  await patch(draft.evolutionId, {
    expectedDraftVersion: 1,
    complaint: 'Não permitido',
  }).expect(404)
})
test('BE-035: finalizada e identidade são imutáveis; replay não salva em finalizada', async () => {
  const v = await f.visit(),
    draft = (await create(v.encounterId).expect(201)).body,
    key = randomUUID(),
    body = { expectedDraftVersion: 1, complaint: 'Texto preservado' }
  await patch(draft.evolutionId, body, key).expect(200)
  await f.db.clinicalEvolution.update({
    where: { id: draft.evolutionId },
    data: {
      status: 'finalized',
      finalizedAt: new Date(),
      contentHash: 'f'.repeat(64),
    },
  })
  const result = await patch(draft.evolutionId, body, key).expect(409)
  assert.equal(result.body.error.draftConflict.status, 'finalized')
  await assert.rejects(
    f.db.clinicalEvolution.update({
      where: { id: draft.evolutionId },
      data: { draftVersion: 3, payloadEncrypted: 'changed' },
    }),
  )
  await assert.rejects(
    f.db.clinicalEvolution.delete({ where: { id: draft.evolutionId } }),
  )
  await assert.rejects(
    f.db.evolutionDraftCommand.delete({ where: { requestKey: key } }),
  )
  const another = await f.visit(undefined, true),
    created = (await create(another.encounterId).expect(201)).body
  await assert.rejects(
    f.db.clinicalEvolution.update({
      where: { id: created.evolutionId },
      data: { authorProfessionalId: f.professionalIds[1], draftVersion: 2 },
    }),
  )
  await assert.rejects(
    f.db.clinicalEvolution.update({
      where: { id: created.evolutionId },
      data: {
        status: 'finalized',
        finalizedAt: null,
        contentHash: 'f'.repeat(64),
      },
    }),
  )
})
test('BE-035: falha de auditoria reverte texto/versão/nonce e permite retry', async () => {
  const v = await f.visit(),
    draft = (await create(v.encounterId, { complaint: 'Original' }).expect(201))
      .body,
    key = randomUUID(),
    body = { expectedDraftVersion: 1, complaint: 'Atualização fictícia' }
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_draft_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='evolution.draft_saved' THEN RAISE EXCEPTION 'test draft audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_draft_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_draft_audit()',
  )
  try {
    await patch(draft.evolutionId, body, key).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_draft_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_draft_audit()')
  }
  assert.equal(
    (await get(draft.evolutionId).expect(200)).body.complaint,
    'Original',
  )
  assert.equal(
    await f.db.evolutionDraftCommand.count({ where: { requestKey: key } }),
    0,
  )
  assert.equal(
    (await patch(draft.evolutionId, body, key).expect(200)).body.draftVersion,
    2,
  )
})
test('BE-035: schemas recusam campos/nonce inválidos e OpenAPI publica recuperação', async () => {
  const v = await f.visit()
  await create(v.encounterId, {
    authorProfessionalId: f.professionalIds[1],
  }).expect(400)
  await create(v.encounterId, { history: 'a'.repeat(20001) }).expect(400)
  const draft = (await create(v.encounterId).expect(201)).body
  await patch(draft.evolutionId, { expectedDraftVersion: 1 }).expect(400)
  await patch(draft.evolutionId, {
    expectedDraftVersion: 0,
    history: 'Teste',
  }).expect(400)
  await patch(
    draft.evolutionId,
    { expectedDraftVersion: 1, history: 'Teste' },
    'invalid',
  ).expect(400)
  await request(f.app)
    .patch(`/v1/clinical/evolutions/${draft.evolutionId}/draft`)
    .set('Authorization', token())
    .send({ expectedDraftVersion: 1, history: 'Teste' })
    .expect(400)
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(doc.paths['/clinical/encounters/{id}/evolutions/draft'].get)
  assert.ok(
    doc.paths['/clinical/evolutions/{id}/draft'].patch.parameters.some(
      (p: { name: string }) => p.name === 'idempotency-key',
    ),
  )
})
