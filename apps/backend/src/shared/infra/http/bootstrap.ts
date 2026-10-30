import { createServer } from 'node:http'
import {
  type composeApplication,
  composeBackendApplication,
} from '../../composition/root'
import type { AppConfig } from '../../config/environment'

export async function startServer(
  config: AppConfig,
  composition?: ReturnType<typeof composeApplication>,
) {
  const runtime = composition ?? (await composeBackendApplication(config))
  const server = createServer(runtime.app)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  let closing: Promise<void> | undefined
  const close = () => {
    closing ??= (async () => {
      const timer = setTimeout(
        () => server.closeAllConnections(),
        config.shutdownTimeoutMs,
      )
      timer.unref()
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
          server.closeIdleConnections()
        })
      } finally {
        clearTimeout(timer)
        await runtime.close()
      }
    })()
    return closing
  }
  return { server, close }
}
