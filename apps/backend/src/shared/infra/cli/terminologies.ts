import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ApplicationError } from '../../../application/errors/application-error'
import type { ManageTerminologies } from '../../../application/use-cases/manage-terminologies'
import { createPrismaClient } from '../../../infrastructure/persistence/prisma/client'
import { createServiceContainer, services } from '../../composition/container'
import { ConfigurationError, loadConfig } from '../../config/environment'

async function run() {
  const config = loadConfig(process.env)
  if (!['development', 'test'].includes(config.environment))
    throw new Error('Demo catalog loading disabled')
  const command = process.argv[2],
    path = process.argv[3]
  const paths =
    command === 'demo' && !path
      ? ['cid10.dev.json', 'tuss.dev.json'].map((name) =>
          resolve(__dirname, '../../../../fixtures/terminologies', name),
        )
      : command === 'load' && path && !process.argv[4]
        ? [resolve(path)]
        : null
  if (!paths) throw new Error('Invalid command')
  const db = createPrismaClient(config.databaseUrl)
  try {
    const service = createServiceContainer(
      config,
      db,
    ).resolve<ManageTerminologies>(services.manageTerminologies)
    for (const inputPath of paths) {
      const result = await service.load(
        JSON.parse(await readFile(inputPath, 'utf8')),
        {
          requestId: randomUUID(),
          actorRoles: [],
          originClient: 'cli',
          authorizationBasis: 'development_catalog_loader',
        },
      )
      console.info(JSON.stringify({ event: 'terminology.loaded', ...result }))
    }
  } finally {
    await db.$disconnect()
  }
}
run().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'terminology.load_failed',
      code:
        error instanceof ApplicationError
          ? error.code
          : error instanceof ConfigurationError
            ? 'INVALID_CONFIGURATION'
            : 'LOAD_FAILED',
      ...(error instanceof ConfigurationError ? { fields: error.fields } : {}),
      message:
        'Confira o catálogo demonstrativo, configuração e migrations. Carga de desenvolvimento não é permitida em ambiente implantado.',
    }),
  )
  process.exitCode = 1
})
