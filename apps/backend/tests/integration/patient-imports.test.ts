import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { ImportPatients } from '../../src/application/use-cases/import-patients'
import { CsvParsePatientParser } from '../../src/infrastructure/imports/patient-csv-parser'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaPatientImportStore } from '../../src/infrastructure/persistence/prisma/patient-import-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { createM1Database, fictitiousCpf } from '../support/m1-database'

let ctx: Awaited<ReturnType<typeof createM1Database>>,
  runtime: Awaited<ReturnType<typeof composeBackendApplication>>
let admin: Awaited<ReturnType<typeof ctx.account>>,
  manager: typeof admin,
  reception: typeof admin
before(async () => {
  ctx = await createM1Database()
  admin = await ctx.account('admin')
  manager = await ctx.account('manager')
  reception = await ctx.account('receptionist')
  runtime = await composeBackendApplication(ctx.config)
})
after(async () => {
  if (runtime) await runtime.close()
  if (ctx) await ctx.close()
})
const header = 'external_id;full_name;birth_date;cpf;email;phone;source_system'
const source = () => `test_${randomUUID().replaceAll('-', '')}`
type Entry = {
  externalId: string
  name: string
  birthDate: string
  cpf: string
  email: string
  phone: string
  sourceSystem: string
}
const entry = (origin: string, extra: Partial<Entry> = {}): Entry => ({
  externalId: randomUUID(),
  name: 'Pessoa Fictícia Importada',
  birthDate: '1980-05-10',
  cpf: fictitiousCpf(),
  email: '',
  phone: '',
  sourceSystem: origin,
  ...extra,
})
const csv = (entries: Entry[], bom = false) =>
  Buffer.from(
    `${bom ? '\uFEFF' : ''}${header}\r\n${entries.map((row) => [row.externalId, row.name, row.birthDate, row.cpf, row.email, row.phone, row.sourceSystem].map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\r\n')}\r\n`,
  )
const preview = (file: Buffer, origin: string, token = admin.token) =>
  request(runtime.app)
    .post('/v1/imports/patients/preview')
    .set('Authorization', token)
    .field('sourceSystem', origin)
    .attach('file', file, {
      filename: 'pacientes.csv',
      contentType: 'text/csv',
    })
const confirm = (
  batch: { batchId: string; fileHash: string },
  token = admin.token,
  key = randomUUID(),
) =>
  request(runtime.app)
    .post(`/v1/imports/patients/${batch.batchId}/confirm`)
    .set('Authorization', token)
    .set('Idempotency-Key', key)
    .send({ expectedFileHash: batch.fileHash })
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
const principal = (
  user: typeof admin,
  role: 'admin' | 'manager' = 'admin',
) => ({
  userId: user.user.id,
  sessionId: user.session.id,
  roles: [role],
  permissions: [],
  mfaVerified: true,
})
function service(now: Date, maxRows = ctx.config.importMaxRows) {
  return new ImportPatients(
    new PrismaPatientImportStore(
      ctx.db,
      new AesSecretBox(ctx.config.encryptionKey, 'import'),
      {
        timeoutMs: ctx.config.importTransactionTimeoutMs,
        maxWaitMs: ctx.config.reservationTxMaxWaitMs,
        internalMinutes: ctx.config.internalIdleMinutes,
        patientMinutes: ctx.config.patientIdleMinutes,
      },
    ),
    new CsvParsePatientParser(),
    new PrismaAuditWriter(ctx.db),
    {
      maxRows,
      maxBytes: ctx.config.importMaxFileMb * 1024 * 1024,
      ttlMinutes: ctx.config.importPreviewTtlMinutes,
      cutoffDate: ctx.config.migrationCutoffDate,
      timeZone: ctx.config.clinicTimeZone,
    },
    () => now,
  )
}

test('BE-028: preview cifrado não cria paciente; confirmar preserva origem sem User, consentimento ou mensagens', async () => {
  const origin = source(),
    person = entry(origin),
    file = csv([person], true)
  const counts = {
    patients: await ctx.db.patientProfile.count(),
    users: await ctx.db.user.count(),
    consents: await ctx.db.consentEvent.count(),
    messages: await ctx.db.notification.count(),
  }
  const p = (await preview(file, origin).expect(200)).body
  assert.equal(p.fileHash, createHash('sha256').update(file).digest('hex'))
  assert.equal(p.accepted, 1)
  assert.equal(p.imported, 0)
  assert.equal(await ctx.db.patientProfile.count(), counts.patients)
  assert.equal(p.rows[0].fullName, person.name)
  assert.ok(!p.rows[0].cpfMasked.includes(person.cpf))
  const raw = await ctx.db.importBatch.findUniqueOrThrow({
    where: { id: p.batchId },
    include: { rows: true },
  })
  assert.ok(!JSON.stringify(raw).includes(person.name))
  assert.ok(!JSON.stringify(raw).includes(person.cpf))
  const final = (await confirm(p).expect(200)).body
  assert.equal(final.imported, 1)
  assert.equal(final.rows[0].status, 'imported')
  const patient = await ctx.db.patientProfile.findUniqueOrThrow({
    where: { cpf: person.cpf },
    include: { importIdentity: true },
  })
  assert.equal(patient.userId, null)
  assert.equal(patient.importIdentity?.sourceSystem, origin)
  assert.equal(patient.importIdentity?.importedBy, admin.user.id)
  assert.equal(patient.importIdentity?.historicalStatus, 'undated')
  assert.equal(await ctx.db.user.count(), counts.users)
  assert.equal(await ctx.db.consentEvent.count(), counts.consents)
  assert.equal(await ctx.db.notification.count(), counts.messages)
  const found = (
    await request(runtime.app)
      .get('/v1/onsite-patients')
      .set('Authorization', reception.token)
      .query({ cpf: person.cpf })
      .expect(200)
  ).body
  assert.equal(found.importOrigin.externalId, person.externalId)
  assert.equal(found.importOrigin.batchId, p.batchId)
  assert.equal(found.importOrigin.historicalStatus, 'undated')
  await assert.rejects(
    ctx.db.patientProfile.update({
      where: { id: patient.id },
      data: { fullName: 'Sobrescrita indevida' },
    }),
  )
  await assert.rejects(
    ctx.db.importBatch.update({
      where: { id: p.batchId },
      data: { fileHash: '0'.repeat(64) },
    }),
  )
  await assert.rejects(
    ctx.db.importIdentity.deleteMany({ where: { patientId: patient.id } }),
  )
  const audit = JSON.stringify(
    await ctx.db.auditEvent.findMany({ where: { resourceId: p.batchId } }),
  )
  assert.ok(!audit.includes(person.name))
  assert.ok(!audit.includes(person.cpf))
})

test('BE-028: encoding, cabeçalho, quantidade de colunas e aspas inválidas geram relatório sem pacientes', async () => {
  const origin = source(),
    before = await ctx.db.patientProfile.count()
  for (const [buffer, code] of [
    [Buffer.from([0xff, 0xfe, 0x80]), 'INVALID_UTF8'],
    [Buffer.from('nome;cpf\nExemplo;0\n'), 'INVALID_HEADER'],
    [Buffer.from(`${header}\na;b;c\n`), 'INVALID_COLUMN_COUNT'],
    [Buffer.from(`${header}\n"sem fechamento`), 'MALFORMED_CSV'],
    [Buffer.alloc(0), 'EMPTY_FILE'],
    [Buffer.from(`${header}\n\0`), 'BINARY_CONTENT'],
  ] as const) {
    const result = await preview(buffer, origin).expect(400)
    assert.ok(
      result.body.error.importReport.fileErrors.includes(code),
      JSON.stringify(result.body),
    )
    assert.equal(result.body.error.importReport.rows.length, 0)
    await confirm(result.body.error.importReport).expect(409)
  }
  assert.equal(await ctx.db.patientProfile.count(), before)
})

test('BE-028: linhas inválidas e duplicidades do arquivo são rejeitadas sem impedir linhas independentes', async () => {
  const origin = source(),
    one = entry(origin),
    duplicate = entry(origin),
    other = entry(origin)
  const rows = [
    one,
    duplicate,
    { ...duplicate, externalId: randomUUID() },
    entry(origin, { cpf: '00000000000' }),
    entry(origin, { birthDate: '2023-02-29' }),
    entry(origin, { email: 'inválido' }),
    entry(origin, { phone: 'telefone inválido' }),
    entry(origin, { sourceSystem: 'outro_sistema' }),
    other,
  ]
  const p = (await preview(csv(rows), origin).expect(200)).body
  assert.equal(p.accepted, 2)
  assert.equal(p.rejected, 7)
  assert.ok(p.rows[1].errors.includes('DUPLICATE_CPF_FILE'))
  assert.ok(p.rows[2].errors.includes('DUPLICATE_CPF_FILE'))
  const final = (await confirm(p).expect(200)).body
  assert.equal(final.imported, 2)
  assert.equal(final.rejected, 7)
  assert.equal(
    await ctx.db.patientProfile.count({
      where: { cpf: { in: [one.cpf, duplicate.cpf, other.cpf] } },
    }),
    2,
  )
})

test('BE-028: CPF da base é rejeitado e colisão surgida após a prévia é revalidada na confirmação', async () => {
  const origin = source(),
    first = entry(origin),
    other = entry(origin)
  const p = (await preview(csv([first, other]), origin).expect(200)).body
  const existing = await ctx.db.patientProfile.create({
    data: {
      fullName: 'Paciente anterior preservado',
      birthDate: new Date('1990-01-01'),
      cpf: first.cpf,
    },
  })
  const final = (await confirm(p).expect(200)).body
  assert.equal(final.imported, 1)
  assert.equal(final.rejected, 1)
  assert.equal(final.rows[0].duplicateOf, existing.id)
  assert.equal(
    (
      await ctx.db.patientProfile.findUniqueOrThrow({
        where: { id: existing.id },
      })
    ).fullName,
    'Paciente anterior preservado',
  )
  const otherOrigin = source()
  const fresh = (
    await preview(
      csv([entry(otherOrigin, { cpf: first.cpf })]),
      otherOrigin,
    ).expect(200)
  ).body
  assert.equal(fresh.rejected, 1)
  assert.deepEqual(fresh.rows[0].errors, ['DUPLICATE_CPF'])
})

test('BE-028: repetição de lote, reimportação e confirmações concorrentes não duplicam pacientes', async () => {
  const origin = source(),
    person = entry(origin),
    file = csv([person])
  const p = (await preview(file, origin).expect(200)).body,
    key = randomUUID()
  const results = await Promise.all([
    confirm(p, admin.token, key),
    confirm(p, admin.token, key),
  ])
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  )
  assert.equal(
    results.reduce((sum, r) => sum + r.body.imported, 0),
    1,
  )
  assert.equal((await confirm(p).expect(200)).body.imported, 0)
  const repeated = (await preview(file, origin).expect(200)).body
  assert.equal(repeated.rows[0].status, 'existing')
  assert.equal((await confirm(repeated).expect(200)).body.imported, 0)
  assert.equal(
    await ctx.db.patientProfile.count({ where: { cpf: person.cpf } }),
    1,
  )
  assert.equal(
    (
      await request(runtime.app)
        .get(`/v1/imports/${p.batchId}`)
        .set('Authorization', admin.token)
        .expect(200)
    ).body.imported,
    1,
  )
  const another = (await preview(csv([entry(origin)]), origin).expect(200)).body
  await confirm(another, admin.token, key).expect(409)
})

test('BE-028: chave externa com conteúdo alterado e chaves repetidas no mesmo arquivo são conflitos', async () => {
  const origin = source(),
    person = entry(origin)
  const p = (await preview(csv([person]), origin).expect(200)).body
  await confirm(p).expect(200)
  const changed = (
    await preview(
      csv([{ ...person, name: 'Conteúdo alterado' }]),
      origin,
    ).expect(200)
  ).body
  assert.ok(changed.rows[0].errors.includes('SOURCE_KEY_CONFLICT'))
  assert.equal((await confirm(changed).expect(200)).body.imported, 0)
  const a = entry(origin),
    b = entry(origin, { externalId: a.externalId })
  const duplicated = (await preview(csv([a, b]), origin).expect(200)).body
  assert.equal(duplicated.accepted, 0)
  assert.ok(
    duplicated.rows.every((row: { errors: string[] }) =>
      row.errors.includes('DUPLICATE_EXTERNAL_ID_FILE'),
    ),
  )
})

test('BE-028: RBAC, isolamento por importador, hash e validade de prévia são verificados no servidor', async () => {
  const origin = source(),
    file = csv([entry(origin)])
  const p = (await preview(file, origin, manager.token).expect(200)).body
  await preview(file, origin, reception.token).expect(403)
  await confirm(p, admin.token).expect(404)
  await request(runtime.app)
    .get(`/v1/imports/${p.batchId}`)
    .set('Authorization', admin.token)
    .expect(404)
  await request(runtime.app)
    .get(`/v1/imports/${p.batchId}`)
    .set('Authorization', reception.token)
    .expect(403)
  await confirm({ ...p, fileHash: '0'.repeat(64) }, manager.token).expect(409)
  await request(runtime.app)
    .post(`/v1/imports/patients/${p.batchId}/confirm`)
    .set('Authorization', manager.token)
    .send({ expectedFileHash: p.fileHash })
    .expect(400)
  const expiry = new Date(p.expiresAt)
  await assert.rejects(
    service(expiry).confirm(
      principal(manager, 'manager'),
      p.batchId,
      p.fileHash,
      randomUUID(),
      context(),
    ),
    { code: 'CONFLICT' },
  )
  await confirm(p, manager.token).expect(200)
})

test('BE-028: parser respeita aspas, separador no nome, multiline, BOM e número físico de linha', async () => {
  const origin = source(),
    person = entry(origin, { name: 'Nome "Exemplo"; Sobrenome\nFictício' })
  const p = (await preview(csv([person], true), origin).expect(200)).body
  assert.equal(p.accepted, 1)
  assert.equal(p.rows[0].fullName, person.name)
  assert.equal(p.rows[0].line, 3)
  const final = (await confirm(p).expect(200)).body
  assert.equal(
    (
      await ctx.db.patientProfile.findUniqueOrThrow({
        where: { id: final.rows[0].targetId },
      })
    ).fullName,
    person.name,
  )
})

test('BE-028: limites configurados e multipart inválido são recusados sem criar entidades de negócio', async () => {
  const origin = source(),
    before = await ctx.db.patientProfile.count()
  await preview(
    Buffer.alloc(ctx.config.importMaxFileMb * 1024 * 1024 + 1, 65),
    origin,
  ).expect(413)
  await request(runtime.app)
    .post('/v1/imports/patients/preview')
    .set('Authorization', admin.token)
    .send({ sourceSystem: origin })
    .expect(400)
  await request(runtime.app)
    .post('/v1/imports/patients/preview')
    .set('Authorization', admin.token)
    .field('sourceSystem', origin)
    .field('unexpected', 'x')
    .attach('file', csv([entry(origin)]), { filename: 'x.csv' })
    .expect(400)
  const svc = service(new Date(), 1)
  await assert.rejects(
    svc.preview(
      principal(admin),
      origin,
      csv([entry(origin), entry(origin)]),
      context(),
    ),
    (error) => {
      assert.equal((error as { code: string }).code, 'VALIDATION_ERROR')
      return true
    },
  )
  assert.equal(await ctx.db.patientProfile.count(), before)
})

test('BE-028: falha na auditoria reverte todo o lote, sem pacientes ou identidades parciais', async () => {
  const origin = source(),
    person = entry(origin),
    p = (await preview(csv([person]), origin).expect(200)).body
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_import_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='import.confirmed' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  )
  await ctx.db.$executeRawUnsafe(
    'CREATE TRIGGER reject_import_test BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_import_test()',
  )
  try {
    await confirm(p).expect(500)
  } finally {
    await ctx.db.$executeRawUnsafe(
      'DROP TRIGGER reject_import_test ON "AuditEvent"',
    )
    await ctx.db.$executeRawUnsafe('DROP FUNCTION fail_import_test()')
  }
  assert.equal(
    await ctx.db.patientProfile.count({ where: { cpf: person.cpf } }),
    0,
  )
  assert.equal(
    await ctx.db.importIdentity.count({ where: { sourceSystem: origin } }),
    0,
  )
  assert.equal(
    (await ctx.db.importBatch.findUniqueOrThrow({ where: { id: p.batchId } }))
      .status,
    'preview',
  )
  await confirm(p).expect(200)
})

test('BE-028: lotes concorrentes para o mesmo CPF criam somente um cadastro e uma origem', async () => {
  const firstOrigin = source(),
    secondOrigin = source(),
    cpf = fictitiousCpf()
  const a = (
    await preview(csv([entry(firstOrigin, { cpf })]), firstOrigin).expect(200)
  ).body
  const b = (
    await preview(
      csv([entry(secondOrigin, { cpf })]),
      secondOrigin,
      manager.token,
    ).expect(200)
  ).body
  const results = await Promise.all([confirm(a), confirm(b, manager.token)])
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  )
  assert.equal(
    results.reduce((n, r) => n + r.body.imported, 0),
    1,
  )
  assert.equal(
    results.reduce((n, r) => n + r.body.rejected, 0),
    1,
  )
  assert.equal(await ctx.db.patientProfile.count({ where: { cpf } }), 1)
  assert.equal(
    await ctx.db.importIdentity.count({
      where: { sourceSystem: { in: [firstOrigin, secondOrigin] } },
    }),
    1,
  )
})

test('BE-028: confirmação revalida papel e MFA mesmo com principal anterior ainda em memória', async () => {
  const actor = await ctx.account('manager'),
    origin = source(),
    person = entry(origin)
  const p = (await preview(csv([person]), origin, actor.token).expect(200)).body
  await ctx.db.userRoleAssignment.updateMany({
    where: { userId: actor.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await assert.rejects(
    service(new Date()).confirm(
      principal(actor, 'manager'),
      p.batchId,
      p.fileHash,
      randomUUID(),
      context(),
    ),
    { code: 'FORBIDDEN' },
  )
  await ctx.db.userRoleAssignment.create({
    data: { userId: actor.user.id, roleCode: 'manager' },
  })
  await ctx.db.session.update({
    where: { id: actor.session.id },
    data: { mfaVerifiedAt: null },
  })
  await assert.rejects(
    service(new Date()).confirm(
      principal(actor, 'manager'),
      p.batchId,
      p.fileHash,
      randomUUID(),
      context(),
    ),
    { code: 'FORBIDDEN' },
  )
  assert.equal(
    await ctx.db.patientProfile.count({ where: { cpf: person.cpf } }),
    0,
  )
})
