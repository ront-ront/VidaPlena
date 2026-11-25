import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'
import request from 'supertest'
import type { CatalogDataset } from '../../src/application/ports/terminologies'
import { ManageTerminologies } from '../../src/application/use-cases/manage-terminologies'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import type { PrismaTerminologyStore } from '../../src/infrastructure/persistence/prisma/terminology-store'
import {
  createServiceContainer,
  services,
} from '../../src/shared/composition/container'
import { terminologyListResponse } from '../../src/shared/infra/http/contracts/terminologies'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
let service: ManageTerminologies,
  store: PrismaTerminologyStore,
  cid: CatalogDataset,
  tuss: CatalogDataset
before(async () => {
  f = await createBookingFixture()
  const scope = createServiceContainer(f.config, f.db)
  service = scope.resolve<ManageTerminologies>(services.manageTerminologies)
  store = scope.resolve<PrismaTerminologyStore>(services.terminologyStore)
  cid = JSON.parse(
    await readFile(
      resolve(__dirname, '../../fixtures/terminologies/cid10.dev.json'),
      'utf8',
    ),
  )
  tuss = JSON.parse(
    await readFile(
      resolve(__dirname, '../../fixtures/terminologies/tuss.dev.json'),
      'utf8',
    ),
  )
})
after(async () => {
  if (f) await f.close()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  originClient: 'test',
  authorizationBasis: 'development_catalog_loader',
})
const professional = () =>
  f.principal(f.professionalAccounts[0], 'professional')
const search = (
  kind = 'cid10',
  query: Record<string, string> = {},
  token = f.professionalAccounts[0].token,
) =>
  request(f.app)
    .get(`/v1/terminologies/${kind}`)
    .query(query)
    .set('Authorization', token)

test('BE-034: sem carga local, busca retorna coleção vazia e demo explícito', async () => {
  const result = (await search().expect(200)).body
  terminologyListResponse.parse(result)
  assert.deepEqual(result, {
    items: [],
    nextCursor: null,
    catalogVersion: null,
    demo: true,
  })
  assert.equal((await search('tuss').expect(200)).body.items.length, 0)
})
test('BE-034: carga versionada concorrente/idempotente preserva origem, licença e auditoria', async () => {
  const loaded = await Promise.all([
    service.load(cid, context()),
    service.load(cid, context()),
  ])
  assert.deepEqual(loaded.map((r) => r.loadedCount).sort(), [0, 4])
  assert.equal(loaded[0].catalogId, loaded[1].catalogId)
  await service.load(tuss, context())
  assert.equal(await f.db.terminologyCatalog.count(), 2)
  const row = await f.db.terminologyCatalog.findUniqueOrThrow({
    where: { id: loaded[0].catalogId },
  })
  assert.equal(row.demo, true)
  assert.ok(row.source.includes('sintéticos'))
  assert.ok(row.license.includes('MIT'))
  assert.match(row.checksum, /^[a-f0-9]{64}$/)
  assert.equal(
    await f.db.diagnosisCode.count({ where: { catalogId: row.id } }),
    4,
  )
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: { resourceId: row.id, action: 'terminology.loaded' },
    }),
  )
})
test('BE-034: metadados/duplicidades inválidas e versão alterada não gravam parcialmente', async () => {
  const before = await f.db.terminologyCatalog.count()
  for (const input of [
    { ...cid, demo: false },
    { ...cid, source: '' },
    { ...cid, entries: [cid.entries[0], cid.entries[0]] },
    { ...cid, entries: [] },
    { ...cid, license: '' },
  ])
    assert.throws(() => service.load(input, context()), {
      code: 'VALIDATION_ERROR',
    })
  await assert.rejects(
    service.load(
      {
        ...cid,
        entries: cid.entries.map((e, i) =>
          i ? e : { ...e, description: 'Mudança sem versão nova' },
        ),
      },
      context(),
    ),
    { code: 'CONFLICT' },
  )
  assert.equal(await f.db.terminologyCatalog.count(), before)
  const selection = await f.db.terminologySelection.findUniqueOrThrow({
    where: { terminology: 'CID10' },
    include: { catalog: true },
  })
  assert.equal(selection.catalog.version, cid.version)
})
test('BE-034: pesquisa por código/descrição ignora caixa/acentos, recusa papéis e perfil inativo', async () => {
  const code = (await search('cid10', { q: 'dev-cid-001' }).expect(200)).body
  terminologyListResponse.parse(code)
  assert.equal(code.items.length, 1)
  assert.equal(code.items[0].code, 'DEV-CID-001')
  assert.equal(code.items[0].demo, true)
  assert.equal(
    (await search('cid10', { q: 'diagnostico ficticio' }).expect(200)).body
      .items.length,
    3,
  )
  assert.equal(
    (await search('cid10', { q: 'DEV-CID-004' }).expect(200)).body.items.length,
    0,
  )
  assert.equal(
    (await search('tuss', { q: 'inexistente' }).expect(200)).body.items.length,
    0,
  )
  const patient = await f.patient()
  for (const token of [
    f.admin.token,
    f.reception.token,
    patient.token,
    (await f.account('manager')).token,
  ])
    await search('cid10', {}, token).expect(403)
  await request(f.app).get('/v1/terminologies/cid10').expect(401)
  await f.db.professionalProfile.update({
    where: { id: f.professionalIds[0] },
    data: { active: false },
  })
  try {
    await search().expect(403)
  } finally {
    await f.db.professionalProfile.update({
      where: { id: f.professionalIds[0] },
      data: { active: true },
    })
  }
  await search('cid10', { q: 'a'.repeat(201) }).expect(400)
})
test('BE-034: paginação estável e cursor vinculado ao catálogo/filtro vigentes', async () => {
  const first = (await search().expect(200)).body
  const initial = await f.db.diagnosisCode.findFirstOrThrow({
    where: { code: first.items[0].code },
  })
  await service.load(
    {
      ...cid,
      version: 'pages-1',
      entries: Array.from({ length: 65 }, (_, i) => ({
        code: `DEV-CID-${String(i + 100).padStart(3, '0')}`,
        description: `Diagnóstico fictício paginado ${i}`,
        active: true,
      })),
    },
    context(),
  )
  await search('cid10', { cursor: initial.id }).expect(404)
  const page1 = (await search().expect(200)).body,
    page2 = (await search('cid10', { cursor: page1.nextCursor }).expect(200))
      .body,
    page3 = (await search('cid10', { cursor: page2.nextCursor }).expect(200))
      .body
  assert.deepEqual(
    [page1.items.length, page2.items.length, page3.items.length],
    [30, 30, 5],
  )
  assert.equal(
    new Set([...page1.items, ...page2.items, ...page3.items].map((e) => e.code))
      .size,
    65,
  )
  assert.equal(page3.nextCursor, null)
  await search('cid10', { cursor: page1.nextCursor, q: 'inexistente' }).expect(
    404,
  )
  await search('cid10', { cursor: randomUUID() }).expect(404)
  await search('cid10', { cursor: 'invalid' }).expect(400)
})
test('BE-034: snapshot preserva descrição/versão, rejeita código inativo e trata TUSS particular', async () => {
  await service.load(cid, context())
  const snapshot = await store.transaction((tx) =>
    service.snapshot(tx, 'CID10', {
      code: 'DEV-CID-001',
      version: cid.version,
    }),
  )
  assert.ok(Object.isFrozen(snapshot))
  const copy = { ...snapshot }
  await service.load(
    {
      ...cid,
      version: 'vidaplena-demo-2',
      entries: cid.entries.map((e, i) =>
        i ? e : { ...e, description: 'Descrição fictícia revisada para teste' },
      ),
    },
    context(),
  )
  assert.deepEqual(snapshot, copy)
  assert.equal(
    (
      await store.transaction((tx) =>
        service.snapshot(tx, 'CID10', {
          code: 'DEV-CID-001',
          version: 'vidaplena-demo-2',
        }),
      )
    ).description,
    'Descrição fictícia revisada para teste',
  )
  await assert.rejects(
    store.transaction((tx) =>
      service.snapshot(tx, 'CID10', {
        code: 'DEV-CID-001',
        version: cid.version,
      }),
    ),
    { code: 'CONFLICT' },
  )
  for (const code of ['DEV-CID-004', 'INVALID'])
    await assert.rejects(
      store.transaction((tx) =>
        service.snapshot(tx, 'CID10', { code, version: 'vidaplena-demo-2' }),
      ),
      { code: 'VALIDATION_ERROR' },
    )
  assert.equal(
    await store.transaction((tx) => service.procedureSnapshot(tx, null, true)),
    null,
  )
  await assert.rejects(
    store.transaction((tx) => service.procedureSnapshot(tx, null, false)),
    { code: 'VALIDATION_ERROR' },
  )
  await assert.rejects(
    store.transaction((tx) =>
      service.procedureSnapshot(
        tx,
        { code: 'INVALID', version: tuss.version },
        true,
      ),
    ),
    { code: 'VALIDATION_ERROR' },
  )
  assert.equal(
    (
      await store.transaction((tx) =>
        service.procedureSnapshot(
          tx,
          { code: 'DEV-TUSS-001', version: tuss.version },
          true,
        ),
      )
    )?.code,
    'DEV-TUSS-001',
  )
  const oldCatalog = await f.db.terminologyCatalog.findUniqueOrThrow({
    where: {
      terminology_version: { terminology: 'CID10', version: cid.version },
    },
  })
  assert.equal(
    (
      await f.db.diagnosisCode.findUniqueOrThrow({
        where: {
          catalogId_code: { catalogId: oldCatalog.id, code: snapshot.code },
        },
      })
    ).description,
    snapshot.description,
  )
})
test('BE-034: catálogo/entradas imutáveis no PostgreSQL e seleção não troca de terminologia', async () => {
  const row = await f.db.terminologyCatalog.findFirstOrThrow({
      where: { terminology: 'CID10' },
    }),
    diagnosis = await f.db.diagnosisCode.findFirstOrThrow(),
    procedure = await f.db.procedureCode.findFirstOrThrow()
  await assert.rejects(
    f.db.terminologyCatalog.update({
      where: { id: row.id },
      data: { source: 'changed' },
    }),
  )
  await assert.rejects(
    f.db.terminologyCatalog.delete({ where: { id: row.id } }),
  )
  await assert.rejects(
    f.db.diagnosisCode.update({
      where: { id: diagnosis.id },
      data: { description: 'changed' },
    }),
  )
  await assert.rejects(
    f.db.procedureCode.delete({ where: { id: procedure.id } }),
  )
  const tussCatalog = await f.db.terminologyCatalog.findFirstOrThrow({
    where: { terminology: 'TUSS' },
  })
  await assert.rejects(
    f.db.terminologySelection.update({
      where: { terminology: 'CID10' },
      data: { catalogId: tussCatalog.id },
    }),
  )
})
test('BE-034: ambiente implantado não carrega nem usa catálogo demonstrativo', async () => {
  for (const environment of ['staging', 'production']) {
    const deployed = new ManageTerminologies(
      store,
      new PrismaAuditWriter(f.db),
      environment,
    )
    assert.throws(() => deployed.load(cid, context()), { code: 'FORBIDDEN' })
    await assert.rejects(
      deployed.search(professional(), 'CID10', {}, context()),
      { code: 'SERVICE_UNAVAILABLE' },
    )
    await assert.rejects(
      store.transaction((tx) =>
        deployed.snapshot(tx, 'CID10', {
          code: 'DEV-CID-001',
          version: cid.version,
        }),
      ),
      { code: 'SERVICE_UNAVAILABLE' },
    )
  }
})
test('BE-034: CLI lê fixture versionada e arquivo local, com reexecução idempotente', async () => {
  const env = {
    ...process.env,
    APP_ENV: 'test',
    ENVIRONMENT_ID: 'test-catalog',
    DOTENV_CONFIG_PATH: '/dev/null',
    FRONTEND_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: f.config.databaseUrl,
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: f.config.jwtSecret,
    FILE_ENCRYPTION_KEY: f.config.encryptionKey.toString('base64'),
  }
  const demo = spawnSync('yarn', ['terminologies:demo'], {
    env,
    encoding: 'utf8',
  })
  assert.equal(demo.status, 0, demo.stderr)
  assert.ok(
    demo.stdout.includes('"terminology":"CID10"') &&
      demo.stdout.includes('"terminology":"TUSS"'),
  )
  const path = resolve(f.config.fileStoragePath, '../cid-cli.json')
  await writeFile(path, JSON.stringify({ ...cid, version: 'cli-1' }))
  for (const expected of [4, 0]) {
    const loaded = spawnSync('yarn', ['terminologies:load', path], {
      env,
      encoding: 'utf8',
    })
    assert.equal(loaded.status, 0, loaded.stderr)
    assert.ok(loaded.stdout.includes(`"loadedCount":${expected}`))
  }
  assert.equal((await search().expect(200)).body.catalogVersion, 'cli-1')
  const blocked = spawnSync('yarn', ['terminologies:demo'], {
    env: {
      ...env,
      APP_ENV: 'production',
      ENVIRONMENT_ID: 'production-test',
      DATA_REGION_COUNTRY: 'BR',
      CORS_ORIGINS: 'https://localhost.invalid',
      FRONTEND_ORIGIN: 'https://localhost.invalid',
      SIGNATURE_PROVIDER: 'disabled',
      MALWARE_SCANNER: 'disabled',
      EMAIL_SENDER: 'disabled',
    },
    encoding: 'utf8',
  })
  assert.equal(blocked.status, 1)
  assert.ok(blocked.stderr.includes('terminology.load_failed'))
})
test('BE-034: OpenAPI documenta busca e não expõe integrações FHIR/TISS', async () => {
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(doc.paths['/terminologies/cid10'].get)
  assert.ok(doc.paths['/terminologies/tuss'].get)
  await request(f.app).get('/v1/fhir/Patient').expect(404)
  await request(f.app).get('/v1/tiss').expect(404)
})
