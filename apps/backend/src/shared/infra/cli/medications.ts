import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ApplicationError } from '../../../application/errors/application-error'
import type { ManageMedications } from '../../../application/use-cases/manage-medications'
import { createPrismaClient } from '../../../infrastructure/persistence/prisma/client'
import { createServiceContainer, services } from '../../composition/container'
import { ConfigurationError, loadConfig } from '../../config/environment'

async function run() {
  const config = loadConfig(process.env)
  if (!['development', 'test'].includes(config.environment))
    throw new Error('Demo catalog disabled')
  const command = process.argv[2],
    argument = process.argv[3]
  const path =
    command === 'demo' && !argument
      ? resolve(
          __dirname,
          '../../../../fixtures/medications/medications.dev.json',
        )
      : command === 'load' && argument && !process.argv[4]
        ? resolve(argument)
        : null
  if (!path) throw new Error('Invalid command')
  const db = createPrismaClient(config.databaseUrl)
  try {
    const result = await createServiceContainer(config, db)
      .resolve<ManageMedications>(services.manageMedications)
      .load(JSON.parse(await readFile(path, 'utf8')), {
        requestId: randomUUID(),
        actorRoles: [],
        originClient: 'cli',
        authorizationBasis: 'development_catalog_loader',
      })
    console.info(
      JSON.stringify({ event: 'medication.catalog_loaded', ...result }),
    )
  } finally {
    await db.$disconnect()
  }
}
run().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'medication.load_failed',
      code:
        error instanceof ApplicationError
          ? error.code
          : error instanceof ConfigurationError
            ? 'INVALID_CONFIGURATION'
            : 'LOAD_FAILED',
      ...(error instanceof ConfigurationError ? { fields: error.fields } : {}),
      message:
        'Confira o catálogo demonstrativo, configuração e migrations. Carga não permitida em ambiente implantado.',
    }),
  )
  process.exitCode = 1
})
