import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import request from 'supertest'
import type { ManageFiles } from '../../src/application/use-cases/manage-files'
import { ConsentEvidenceReconciler } from '../../src/infrastructure/jobs/consent-evidence-reconciler'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import {
  createServiceContainer,
  services,
} from '../../src/shared/composition/container'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { createClinicalFixture } from '../support/m2-clinical'

test('BE-036: dump/restore preserva evolução, adendo, retenção e proteção contra exclusão', async () => {
  const f = await createClinicalFixture(),
    container = process.env.TEST_POSTGRES_CONTAINER
  let restored: ReturnType<typeof createPrismaClient> | undefined,
    runtime: Awaited<ReturnType<typeof composeBackendApplication>> | undefined,
    created = false
  const databaseName = `vp_restore_${randomUUID().replaceAll('-', '')}_test`,
    url = new URL(f.config.databaseUrl)
  url.pathname = `/${databaseName}`
  try {
    if (container) assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
    const visit = await f.visit(),
      auth = f.professionalAccounts[0].token
    const draft = (
      await request(f.app)
        .post(`/v1/clinical/encounters/${visit.encounterId}/evolutions/draft`)
        .set('Authorization', auth)
        .send({
          complaint: 'Queixa fictícia para restauração',
          conduct: 'Conduta fictícia para restauração',
        })
        .expect(201)
    ).body
    await request(f.app)
      .post(`/v1/clinical/evolutions/${draft.evolutionId}/finalize`)
      .set('Authorization', auth)
      .send({ expectedDraftVersion: 1 })
      .expect(200)
    await request(f.app)
      .post(`/v1/clinical/evolutions/${draft.evolutionId}/addenda`)
      .set('Authorization', auth)
      .send({
        reason: 'Correção fictícia',
        correctionText: 'Adendo persistido no backup',
      })
      .expect(201)
    const before = (
      await request(f.app)
        .get(`/v1/clinical/evolutions/${draft.evolutionId}`)
        .set('Authorization', auth)
        .expect(200)
    ).body
    const hold = await f.db.clinicalRetentionEvent.findUniqueOrThrow({
      where: { encounterId: visit.encounterId },
    })
    const sourceUrl = new URL(f.config.databaseUrl),
      username = decodeURIComponent(sourceUrl.username)
    const dump = container
      ? spawnSync(
          'docker',
          [
            'exec',
            container,
            'pg_dump',
            '-U',
            username,
            '--format=custom',
            '--dbname',
            sourceUrl.pathname.slice(1),
          ],
          { maxBuffer: 20 * 1024 * 1024 },
        )
      : spawnSync(
          'pg_dump',
          ['--format=custom', '--dbname', sourceUrl.toString()],
          { maxBuffer: 20 * 1024 * 1024 },
        )
    assert.equal(
      dump.status,
      0,
      'pg_dump deve funcionar: instale cliente compatível ou informe TEST_POSTGRES_CONTAINER do servidor de teste.',
    )
    await f.db.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
    created = true
    const args = ['--clean', '--if-exists', '--no-owner', '--exit-on-error']
    const restore = container
      ? spawnSync(
          'docker',
          [
            'exec',
            '-i',
            container,
            'pg_restore',
            '-U',
            username,
            ...args,
            '--dbname',
            databaseName,
          ],
          { input: dump.stdout, maxBuffer: 20 * 1024 * 1024 },
        )
      : spawnSync('pg_restore', [...args, '--dbname', url.toString()], {
          input: dump.stdout,
          maxBuffer: 20 * 1024 * 1024,
        })
    assert.equal(
      restore.status,
      0,
      'pg_restore deve restaurar a base descartável sem erro.',
    )
    restored = createPrismaClient(url.toString())
    const config = { ...f.config, databaseUrl: url.toString() }
    runtime = await composeBackendApplication(config)
    const after = (
      await request(runtime.app)
        .get(`/v1/clinical/evolutions/${draft.evolutionId}`)
        .set('Authorization', auth)
        .expect(200)
    ).body
    assert.deepEqual(after, before)
    assert.deepEqual(
      await restored.clinicalRetentionEvent.findUniqueOrThrow({
        where: { encounterId: visit.encounterId },
      }),
      hold,
    )
    await assert.rejects(
      restored.clinicalEvolution.delete({ where: { id: draft.evolutionId } }),
    )
    await assert.rejects(
      restored.evolutionAddendum.delete({
        where: { id: after.addenda[0].addendumId },
      }),
    )
    const scope = createServiceContainer(config, restored)
    await new ConsentEvidenceReconciler(
      restored,
      scope.resolve<ManageFiles>(services.manageFiles),
      config.fileOrphanReconcileMinutes,
      () => new Date(+hold.retainUntil - 1),
    ).runOnce()
    assert.equal(
      (
        await restored.clinicalEvolution.findUniqueOrThrow({
          where: { id: draft.evolutionId },
        })
      ).contentHash,
      before.contentHash,
    )
  } finally {
    if (runtime) await runtime.close()
    if (restored) await restored.$disconnect()
    if (created) await f.db.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
    await f.close()
  }
})
