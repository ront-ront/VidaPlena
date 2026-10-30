import 'dotenv/config'
import { ConfigurationError, loadConfig } from '../../config/environment'
import { startServer } from './bootstrap'

async function main() {
  const config = loadConfig(process.env)
  const runtime = await startServer(config)
  const shutdown = () => {
    runtime.close().catch(() => {
      console.error('Falha ao encerrar a aplicação.')
      process.exitCode = 1
    })
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : 'Não foi possível iniciar a aplicação.',
  )
  process.exitCode = 1
})
