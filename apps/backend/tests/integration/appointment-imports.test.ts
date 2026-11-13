import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { ImportAppointments } from '../../src/application/use-cases/import-appointments'
import { CsvParseAppointmentParser } from '../../src/infrastructure/imports/appointment-csv-parser'
import { PrismaAppointmentImportStore } from '../../src/infrastructure/persistence/prisma/appointment-import-store'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaReminderStore } from '../../src/infrastructure/persistence/prisma/reminder-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { createBookingFixture } from '../support/m1-bookings'
import { fictitiousCpf } from '../support/m1-database'

let f: Awaited<ReturnType<typeof createBookingFixture>>
let manager: Awaited<ReturnType<typeof f.account>>
before(async () => {
  f = await createBookingFixture()
  manager = await f.account('manager')
})
after(async () => {
  if (f) await f.close()
})
const origin = () => `demo_${randomUUID().replaceAll('-', '')}`
const header =
  'external_id;patient_cpf;professional_external_id;specialty_code;room_name;starts_at;ends_at;modality;visit_type;status;source_system'
type Entry = {
  externalId: string
  cpf: string
  professional: string
  specialty: string
  room: string
  startsAt: string
  endsAt: string
  modality: string
  visitType: string
  status: string
  source: string
}
const row = (
  source: string,
  cpf: string,
  offset: number,
  extra: Partial<Entry> = {},
): Entry => ({
  externalId: randomUUID(),
  cpf,
  professional: f.professionalIds[0],
  specialty: 'M1',
  room: 'Sala 1',
  startsAt: f.at(offset),
  endsAt: f.at(offset, '09:00'),
  modality: 'onsite',
  visitType: 'first',
  status: 'confirmed',
  source,
  ...extra,
})
const csv = (rows: Entry[]) =>
  Buffer.from(
    `${header}\n${rows.map((r) => [r.externalId, r.cpf, r.professional, r.specialty, r.room, r.startsAt, r.endsAt, r.modality, r.visitType, r.status, r.source].map((s) => `"${s.replaceAll('"', '""')}"`).join(';')).join('\n')}\n`,
  )
const preview = (rows: Entry[], source: string, token = f.admin.token) =>
  upload(csv(rows), source, token)
const upload = (buffer: Buffer, source: string, token = f.admin.token) =>
  request(f.app)
    .post('/v1/imports/appointments/preview')
    .set('Authorization', token)
    .field('sourceSystem', source)
    .attach('file', buffer, { filename: 'agenda.csv', contentType: 'text/csv' })
const confirm = (
  p: { batchId: string; fileHash: string },
  token = f.admin.token,
  key = randomUUID(),
) =>
  request(f.app)
    .post(`/v1/imports/appointments/${p.batchId}/confirm`)
    .set('Authorization', token)
    .set('Idempotency-Key', key)
    .send({ expectedFileHash: p.fileHash })
const read = (id: string, token = f.admin.token) =>
  request(f.app).get(`/v1/imports/${id}`).set('Authorization', token)
function cpfOf(value: { cpf: string | null }) {
  assert.ok(value.cpf)
  return value.cpf
}
function requiredId(value: string | undefined) {
  assert.ok(value)
  return value
}
async function patient() {
  return f.db.patientProfile.create({
    data: {
      fullName: 'Paciente Fictício CSV',
      cpf: fictitiousCpf(),
      birthDate: new Date('1980-01-01'),
    },
  })
}
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
function service(cutoffDate: string | null, now = () => new Date()) {
  return new ImportAppointments(
    new PrismaAppointmentImportStore(
      f.db,
      new AesSecretBox(f.config.encryptionKey, 'import'),
      {
        maxWaitMs: f.config.reservationTxMaxWaitMs,
        timeoutMs: f.config.importTransactionTimeoutMs,
        retryAttempts: f.config.reservationTxRetryAttempts,
        internalMinutes: f.config.internalIdleMinutes,
        patientMinutes: f.config.patientIdleMinutes,
        reminderScheduleHours: f.config.reminderScheduleHoursBefore,
      },
    ),
    new CsvParseAppointmentParser(),
    new PrismaAuditWriter(f.db),
    {
      maxRows: f.config.importMaxRows,
      maxBytes: f.config.importMaxFileMb * 1024 * 1024,
      ttlMinutes: f.config.importPreviewTtlMinutes,
      cutoffDate,
      timeZone: f.config.clinicTimeZone,
    },
    now,
  )
}

test('BE-029: prévia sem writes e confirmação preservam origem sem conta, consentimento, mensagem ou lembrete', async () => {
  const source = origin(),
    p = await patient(),
    entry = row(source, cpfOf(p), 0),
    before = {
      appointments: await f.db.appointment.count(),
      users: await f.db.user.count(),
      consents: await f.db.consentEvent.count(),
      messages: await f.db.notification.count(),
      reminders: await f.db.reminderJob.count(),
    }
  const batch = (await preview([entry], source).expect(200)).body
  assert.equal(batch.accepted, 1)
  assert.equal(batch.kind, 'appointments')
  assert.equal(await f.db.appointment.count(), before.appointments)
  assert.equal(await f.db.slotReservation.count(), 0)
  const final = (await confirm(batch).expect(200)).body
  assert.equal(final.imported, 1)
  const id = final.rows[0].targetId
  const appt = await f.db.appointment.findUniqueOrThrow({
    where: { id },
    include: { reservations: true, importIdentity: true, history: true },
  })
  assert.equal(appt.bookingSource, 'imported')
  assert.equal(appt.reservations[0].state, 'confirmed')
  assert.equal(appt.importIdentity?.externalId, entry.externalId)
  assert.equal(appt.importIdentity?.importedBy, f.admin.user.id)
  assert.equal(appt.history[0].action, 'imported')
  assert.equal(await f.db.user.count(), before.users)
  assert.equal(await f.db.consentEvent.count(), before.consents)
  assert.equal(await f.db.notification.count(), before.messages)
  assert.equal(await f.db.reminderJob.count(), before.reminders)
  const agenda = (
    await request(f.app)
      .get('/v1/agenda/day')
      .query({ localDate: f.day.toString() })
      .set('Authorization', f.reception.token)
      .expect(200)
  ).body
  const found = agenda.items.find((a: { id: string }) => a.id === id)
  assert.equal(found.importOrigin.sourceSystem, source)
  assert.equal(found.importOrigin.importedBy, f.admin.user.id)
  assert.equal(found.importOrigin.historicalStatus, 'undated')
  const own = (
    await request(f.app)
      .get('/v1/agenda/day')
      .query({ localDate: f.day.toString() })
      .set('Authorization', f.professionalAccounts[0].token)
      .expect(200)
  ).body
  assert.equal(
    own.items.find((a: { id: string }) => a.id === id).importOrigin,
    null,
  )
  const reconciler = new PrismaReminderStore(
    f.db,
    new AesSecretBox(f.config.encryptionKey, 'notification'),
    {
      hoursBefore: f.config.reminderScheduleHoursBefore,
      timeZone: f.config.clinicTimeZone,
      onsiteAddress: '',
    },
  )
  await reconciler.reconcile(new Date(), 100)
  assert.equal(
    await f.db.reminderJob.count({ where: { appointmentId: id } }),
    0,
  )
  assert.equal((await read(batch.batchId).expect(200)).body.imported, 1)
  await assert.rejects(
    f.db.importIdentity.update({
      where: { appointmentId: id },
      data: { externalId: 'mudança' },
    }),
  )
  const audit = JSON.stringify(
    await f.db.auditEvent.findMany({ where: { resourceId: batch.batchId } }),
  )
  assert.ok(!audit.includes(cpfOf(p)))
  assert.ok(!audit.includes(p.fullName))
})

test('BE-029: arquivo malformado produz relatório com zero consultas e reservas', async () => {
  const source = origin(),
    before = await f.db.appointment.count()
  for (const file of [
    Buffer.from([255, 254]),
    Buffer.from('cabecalho;errado\n'),
    Buffer.from(`${header}\na;b\n`),
    Buffer.from(`${header}\n"aberto`),
  ]) {
    const result = await upload(file, source).expect(400)
    assert.ok(result.body.error.importReport.fileErrors.length)
    await confirm(result.body.error.importReport).expect(409)
  }
  assert.equal(await f.db.appointment.count(), before)
})

test('BE-029: formatos e referências inválidas são rejeitados, mantendo linha independente válida', async () => {
  const source = origin(),
    p = await patient(),
    base = row(source, cpfOf(p), 1)
  const entries = [
    base,
    { ...base, externalId: randomUUID(), cpf: fictitiousCpf() },
    { ...base, externalId: randomUUID(), professional: randomUUID() },
    { ...base, externalId: randomUUID(), specialty: 'INEXISTENTE' },
    { ...base, externalId: randomUUID(), room: 'Sala inexistente' },
    { ...base, externalId: randomUUID(), endsAt: f.at(1, '08:30') },
    { ...base, externalId: randomUUID(), startsAt: '2026-11-02T09:00:00' },
    { ...base, externalId: randomUUID(), modality: 'remote' },
    { ...base, externalId: randomUUID(), professional: 'PRO-001' },
    { ...base, externalId: randomUUID(), source: 'outra' },
  ]
  const batch = (await preview(entries, source).expect(200)).body
  assert.equal(batch.accepted, 1)
  assert.equal(batch.rejected, entries.length - 1)
  assert.deepEqual(
    batch.rows.slice(1).map((r: { errors: string[] }) => r.errors[0]),
    [
      'PATIENT_NOT_FOUND',
      'PROFESSIONAL_NOT_FOUND',
      'SPECIALTY_NOT_FOUND',
      'ROOM_NOT_FOUND',
      'INVALID_DURATION',
      'INVALID_STARTS_AT',
      'INVALID_ROOM_NAME',
      'INVALID_PROFESSIONAL_EXTERNAL_ID',
      'SOURCE_SYSTEM_MISMATCH',
    ],
  )
  assert.equal((await confirm(batch).expect(200)).body.imported, 1)
})

test('BE-029: colisões internas de profissional/sala rejeitam linhas posteriores e permitem horários independentes', async () => {
  const source = origin(),
    p = await patient(),
    base = row(source, cpfOf(p), 2)
  const batch = (
    await preview(
      [
        base,
        { ...base, externalId: randomUUID(), room: 'Sala 2' },
        {
          ...base,
          externalId: randomUUID(),
          professional: f.professionalIds[1],
        },
        row(source, cpfOf(p), 3),
      ],
      source,
    ).expect(200)
  ).body
  assert.equal(batch.accepted, 2)
  assert.equal(batch.rejected, 2)
  assert.ok(batch.rows[1].errors.includes('SLOT_UNAVAILABLE'))
  assert.ok(batch.rows[2].errors.includes('SLOT_UNAVAILABLE'))
  assert.equal((await confirm(batch).expect(200)).body.imported, 2)
})

test('BE-029: confirmações concorrentes em lotes distintos nunca duplicam profissional nem sala', async () => {
  const p = await patient(),
    a = origin(),
    b = origin()
  const batchA = (await preview([row(a, cpfOf(p), 4)], a).expect(200)).body
  const batchB = (
    await preview(
      [row(b, cpfOf(p), 4, { professional: f.professionalIds[1] })],
      b,
      manager.token,
    ).expect(200)
  ).body
  const results = await Promise.all([
    confirm(batchA),
    confirm(batchB, manager.token),
  ])
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
  assert.equal(
    await f.db.appointment.count({ where: { startsAt: new Date(f.at(4)) } }),
    1,
  )
  assert.equal(
    await f.db.slotReservation.count({
      where: { startsAt: new Date(f.at(4)), state: 'confirmed' },
    }),
    1,
  )
})

test('BE-029: concorrência entre importação e marcação HTTP usa a mesma barreira BE-020', async () => {
  const p = await f.patient(),
    profile = await f.db.patientProfile.findUniqueOrThrow({
      where: { id: p.patientId },
    }),
    source = origin()
  const batch = (
    await preview([row(source, cpfOf(profile), 5)], source).expect(200)
  ).body
  const [imported, normal] = await Promise.all([
    confirm(batch),
    request(f.app)
      .post('/v1/appointments')
      .set('Authorization', p.token)
      .set('Idempotency-Key', randomUUID())
      .send({
        patientId: p.patientId,
        professionalId: f.professionalIds[0],
        specialtyId: f.specialtyId,
        modality: 'onsite',
        visitType: 'first',
        startsAt: f.at(5),
      }),
  ])
  assert.equal(imported.status, 200)
  assert.ok([201, 409].includes(normal.status))
  assert.equal(imported.body.imported + (normal.status === 201 ? 1 : 0), 1)
  assert.equal(
    await f.db.appointment.count({ where: { startsAt: new Date(f.at(5)) } }),
    1,
  )
})

test('BE-029: sala ocupada após prévia é revalidada sem gravar consulta parcial', async () => {
  const p = await f.patient(),
    profile = await f.db.patientProfile.findUniqueOrThrow({
      where: { id: p.patientId },
    }),
    source = origin()
  const batch = (
    await preview([row(source, cpfOf(profile), 6)], source).expect(200)
  ).body
  const room = await f.db.room.findFirstOrThrow({ where: { name: 'Sala 1' } })
  await f.book(
    p,
    6,
    { professionalId: f.professionalIds[1], roomId: room.id },
    f.reception.token,
  )
  const final = (await confirm(batch).expect(200)).body
  assert.equal(final.imported, 0)
  assert.equal(final.rejected, 1)
  assert.deepEqual(final.rows[0].errors, ['SLOT_UNAVAILABLE'])
  assert.equal(
    await f.db.importIdentity.count({ where: { sourceSystem: source } }),
    0,
  )
})

test('BE-029: histórico concluído/cancelado não ocupa sala nem fabrica evolução ou check-in', async () => {
  const source = origin(),
    p = await patient(),
    start = new Date(Date.now() - 86400000),
    end = new Date(start.getTime() + 3600000)
  const entries = [
    row(source, cpfOf(p), 7, {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      status: 'completed',
    }),
    row(source, cpfOf(p), 7, { status: 'cancelled' }),
    row(source, cpfOf(p), 7),
    row(source, cpfOf(p), 8, { status: 'completed' }),
    row(source, cpfOf(p), 7, {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }),
  ]
  const batch = (await preview(entries, source).expect(200)).body
  assert.equal(batch.accepted, 3)
  assert.equal(batch.rejected, 2)
  const final = (await confirm(batch).expect(200)).body
  assert.equal(final.imported, 3)
  for (const [i, status] of [
    [0, 'completed'],
    [1, 'cancelled'],
  ] as const) {
    const appt = await f.db.appointment.findUniqueOrThrow({
      where: { id: final.rows[i].targetId },
      include: { reservations: true, checkIns: true },
    })
    assert.equal(appt.status, status)
    assert.equal(appt.reservations.length, 0)
    assert.equal(appt.checkIns.length, 0)
  }
  assert.equal(
    await f.db.slotReservation.count({
      where: {
        appointmentId: {
          in: final.rows.flatMap((r: { targetId?: string }) =>
            r.targetId ? [r.targetId] : [],
          ),
        },
        state: 'confirmed',
      },
    }),
    1,
  )
})

test('BE-029: retry, mesma chave externa e arquivo reimportado não duplicam nem sobrescrevem', async () => {
  const source = origin(),
    p = await patient(),
    entry = row(source, cpfOf(p), 9),
    batch = (await preview([entry], source).expect(200)).body,
    key = randomUUID()
  const results = await Promise.all([
    confirm(batch, f.admin.token, key),
    confirm(batch, f.admin.token, key),
  ])
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  )
  assert.equal(
    results.reduce((n, r) => n + r.body.imported, 0),
    1,
  )
  assert.equal((await confirm(batch).expect(200)).body.imported, 0)
  const repeated = (await preview([entry], source).expect(200)).body
  assert.equal(repeated.existing, 1)
  assert.equal((await confirm(repeated).expect(200)).body.imported, 0)
  const changed = (
    await preview(
      [{ ...entry, startsAt: f.at(10), endsAt: f.at(10, '09:00') }],
      source,
    ).expect(200)
  ).body
  assert.deepEqual(changed.rows[0].errors, ['SOURCE_KEY_CONFLICT'])
  assert.equal((await confirm(changed).expect(200)).body.imported, 0)
  const another = (
    await preview([row(source, cpfOf(p), 11)], source).expect(200)
  ).body
  await confirm(another, f.admin.token, key).expect(409)
  assert.equal(
    await f.db.appointment.count({ where: { startsAt: new Date(f.at(9)) } }),
    1,
  )
})

test('BE-029: falha de uma linha reverte só essa linha e retry retoma lote sem duplicar anteriores', async () => {
  const source = origin(),
    p = await patient(),
    entries = [row(source, cpfOf(p), 12), row(source, cpfOf(p), 13)],
    batch = (await preview(entries, source).expect(200)).body
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_import_row_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='imported' AND EXISTS(SELECT 1 FROM "Appointment" a WHERE a."id"=NEW."appointmentId" AND a."startsAt"='${f.at(13)}'::timestamptz) THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER reject_import_row_test BEFORE INSERT ON "AppointmentHistory" FOR EACH ROW EXECUTE FUNCTION fail_import_row_test()',
  )
  try {
    await confirm(batch).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER reject_import_row_test ON "AppointmentHistory"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_import_row_test()')
  }
  const progress = (await read(batch.batchId).expect(200)).body
  assert.equal(progress.status, 'processing')
  assert.equal(progress.imported, 1)
  assert.equal(progress.rows[0].status, 'imported')
  assert.equal(progress.rows[1].status, 'accepted')
  assert.equal(
    await f.db.appointment.count({ where: { startsAt: new Date(f.at(13)) } }),
    0,
  )
  assert.equal(
    await f.db.slotReservation.count({
      where: { startsAt: new Date(f.at(13)) },
    }),
    0,
  )
  const resumed = (await confirm(batch).expect(200)).body
  assert.equal(resumed.imported, 1)
  assert.equal(resumed.status, 'confirmed')
  assert.equal((await read(batch.batchId).expect(200)).body.imported, 2)
})

test('BE-029: RBAC, lote por dono, tipo, hash e MFA são conferidos no servidor', async () => {
  const source = origin(),
    p = await patient(),
    batch = (
      await preview([row(source, cpfOf(p), 14)], source, manager.token).expect(
        200,
      )
    ).body
  await preview([row(source, cpfOf(p), 15)], source, f.reception.token).expect(
    403,
  )
  await confirm(batch).expect(404)
  await read(batch.batchId).expect(404)
  await read(batch.batchId, f.reception.token).expect(403)
  await confirm({ ...batch, fileHash: '0'.repeat(64) }, manager.token).expect(
    409,
  )
  await request(f.app)
    .post(`/v1/imports/patients/${batch.batchId}/confirm`)
    .set('Authorization', manager.token)
    .set('Idempotency-Key', randomUUID())
    .send({ expectedFileHash: batch.fileHash })
    .expect(404)
  await request(f.app)
    .post(`/v1/imports/appointments/${batch.batchId}/confirm`)
    .set('Authorization', manager.token)
    .send({ expectedFileHash: batch.fileHash })
    .expect(400)
  const principal = f.principal(manager, 'manager'),
    svc = service(null, () => new Date(batch.expiresAt))
  await assert.rejects(
    svc.confirm(
      principal,
      batch.batchId,
      batch.fileHash,
      randomUUID(),
      context(),
    ),
    { code: 'CONFLICT' },
  )
  const other = await f.account('manager'),
    b = (
      await preview([row(source, cpfOf(p), 15)], source, other.token).expect(
        200,
      )
    ).body
  await f.db.session.update({
    where: { id: other.session.id },
    data: { mfaVerifiedAt: null },
  })
  await assert.rejects(
    service(null).confirm(
      f.principal(other, 'manager'),
      b.batchId,
      b.fileHash,
      randomUUID(),
      context(),
    ),
    { code: 'FORBIDDEN' },
  )
  await confirm(batch, manager.token).expect(200)
})

test('BE-029: corte usa data local do atendimento e origem permanece congelada após mudança de configuração', async () => {
  const source = origin(),
    p = await patient(),
    principal = f.principal(f.admin, 'admin')
  const entry = row(source, cpfOf(p), 16),
    svc = service('2100-01-01')
  const batch = await svc.preview(principal, source, csv([entry]), context())
  const result = await svc.confirm(
    principal,
    batch.batchId,
    batch.fileHash,
    randomUUID(),
    context(),
  )
  const identity = await f.db.importIdentity.findUniqueOrThrow({
    where: { appointmentId: requiredId(result.rows[0].targetId) },
  })
  assert.equal(identity.historicalStatus, 'before_cutoff')
  assert.equal(
    (await service('2000-01-01').read(principal, batch.batchId, context()))
      .cutoffDate,
    '2100-01-01',
  )
  const source2 = origin(),
    batch2 = await service('2000-01-01').preview(
      principal,
      source2,
      csv([row(source2, cpfOf(p), 17)]),
      context(),
    )
  const final = await service('2000-01-01').confirm(
    principal,
    batch2.batchId,
    batch2.fileHash,
    randomUUID(),
    context(),
  )
  assert.equal(
    (
      await f.db.importIdentity.findUniqueOrThrow({
        where: { appointmentId: requiredId(final.rows[0].targetId) },
      })
    ).historicalStatus,
    'on_or_after_cutoff',
  )
})

test('BE-029: paciente revogado, catálogo inativo e chaves duplicadas não entram na agenda', async () => {
  const source = origin(),
    p = await f.patient(),
    profile = await f.db.patientProfile.findUniqueOrThrow({
      where: { id: p.patientId },
    })
  const batch = (
    await preview([row(source, cpfOf(profile), 18)], source).expect(200)
  ).body
  await f.db.consentEvent.create({
    data: {
      patientId: p.patientId,
      documentVersionId: f.documentId,
      action: 'revoke',
      source: 'portal',
      actorUserId: p.user.id,
      consentingPersonName: p.user.fullName,
    },
  })
  const final = (await confirm(batch).expect(200)).body
  assert.deepEqual(final.rows[0].errors, ['CONSENT_REVOKED'])
  const plain = await patient(),
    dup = row(source, cpfOf(plain), 19)
  const duplicated = (
    await preview(
      [dup, { ...dup, startsAt: f.at(20), endsAt: f.at(20, '09:00') }],
      source,
    ).expect(200)
  ).body
  assert.equal(duplicated.rejected, 2)
  assert.ok(
    duplicated.rows.every((r: { errors: string[] }) =>
      r.errors.includes('DUPLICATE_EXTERNAL_ID_FILE'),
    ),
  )
  const pending = (
    await preview([row(source, cpfOf(plain), 21)], source).expect(200)
  ).body
  const room = await f.db.room.findFirstOrThrow({ where: { name: 'Sala 1' } })
  await f.db.room.update({ where: { id: room.id }, data: { active: false } })
  try {
    assert.deepEqual((await confirm(pending).expect(200)).body.rows[0].errors, [
      'SLOT_UNAVAILABLE',
    ])
  } finally {
    await f.db.room.update({
      where: { id: room.id },
      data: { active: true },
    })
  }
})

test('BE-029: nome de sala reutilizado seleciona cadastro ativo e preserva homônimo inativo', async () => {
  const source = origin(),
    p = await patient(),
    name = `Sala ${randomUUID()}`
  const inactive = await f.db.room.create({ data: { name, active: false } })
  const active = await f.db.room.create({ data: { name, active: true } })
  const batch = (
    await preview([row(source, cpfOf(p), 22, { room: name })], source).expect(
      200,
    )
  ).body
  assert.equal(batch.accepted, 1)
  const final = (await confirm(batch).expect(200)).body
  assert.equal(
    (
      await f.db.appointment.findUniqueOrThrow({
        where: { id: final.rows[0].targetId },
      })
    ).roomId,
    active.id,
  )
  assert.equal(
    (await f.db.room.findUniqueOrThrow({ where: { id: inactive.id } })).active,
    false,
  )
})
