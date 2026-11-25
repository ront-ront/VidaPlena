import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import type { ManageCareLinks } from '../../../application/use-cases/manage-care-links'
import { createPrismaClient } from '../../../infrastructure/persistence/prisma/client'
import { createServiceContainer, services } from '../../composition/container'
import { loadConfig } from '../../config/environment'

async function run() {
  const config = loadConfig(process.env),
    db = createPrismaClient(config.databaseUrl)
  try {
    if (process.argv[2] !== 'reconcile') throw new Error('invalid command')
    const service = createServiceContainer(config, db).resolve<ManageCareLinks>(
      services.manageCareLinks,
    )
    const { count } = await service.reconcile({
      requestId: randomUUID(),
      actorRoles: [],
      originClient: 'cli',
      authorizationBasis: 'maintenance',
    })
    console.info(JSON.stringify({ event: 'care_link.reconciled', count }))
  } finally {
    await db.$disconnect()
  }
}
run().catch(() => {
  console.error(
    JSON.stringify({
      event: 'care_link.reconcile_failed',
      message: 'Confira configuração, conexão e migrations.',
    }),
  )
  process.exitCode = 1
})
