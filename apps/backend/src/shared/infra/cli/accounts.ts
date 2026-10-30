import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApplicationError } from '../../../application/errors/application-error'
import { createPrismaClient } from '../../../infrastructure/persistence/prisma/client'
import { composeProvisioning } from '../../composition/provisioning'
import { ConfigurationError, loadConfig } from '../../config/environment'

async function run() {
  const config = loadConfig(process.env)
  const db = createPrismaClient(config.databaseUrl)
  try {
    const { service } = composeProvisioning(config, db)
    const context = {
      requestId: randomUUID(),
      actorRoles: [],
      authorizationBasis: 'installation',
    }
    if (process.argv[2] === 'seed') {
      const input = z
        .object({
          ADMIN_SEED_EMAIL: z.email(),
          ADMIN_SEED_NAME: z.string().trim().min(1).max(255),
          ADMIN_SEED_PASSWORD: z.string().min(1).max(256),
        })
        .safeParse(process.env)
      if (!input.success)
        throw new ConfigurationError(
          input.error.issues.map((issue) => String(issue.path[0])),
        )
      const result = await service.seed(
        {
          email: input.data.ADMIN_SEED_EMAIL.toLowerCase(),
          fullName: input.data.ADMIN_SEED_NAME,
          password: input.data.ADMIN_SEED_PASSWORD,
        },
        context,
      )
      console.info(
        JSON.stringify({
          event: result.created ? 'admin.created' : 'admin.already_exists',
        }),
      )
    } else if (process.argv[2] === 'review') {
      const result = await service.reviewInactive(context)
      console.info(
        JSON.stringify({
          event: 'account.review_completed',
          count: result.marked,
        }),
      )
    } else throw new Error('Comando inválido.')
  } finally {
    await db.$disconnect()
  }
}
run().catch((error: unknown) => {
  const diagnostic =
    error instanceof ConfigurationError
      ? {
          event: 'account.configuration_invalid',
          fields: [...new Set(error.fields)].sort(),
          message: 'Defina as variáveis indicadas com valores válidos.',
        }
      : error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? {
            event: 'account.password_rejected',
            message:
              'A senha não atende à política: confira AUTH_PASSWORD_MIN_LENGTH, o limite de 72 bytes e a lista de senhas comuns.',
          }
        : error instanceof ApplicationError && error.code === 'CONFLICT'
          ? {
              event: 'account.conflict',
              message: 'Já existe uma conta com o e-mail informado.',
            }
          : {
              event: 'account.command_failed',
              message:
                'Falha inesperada. Confira a conexão com PostgreSQL e as migrations aplicadas.',
            }
  console.error(JSON.stringify(diagnostic))
  process.exitCode = 1
})
