import cors from 'cors'
import express, { type Router } from 'express'
import type { OperationalTelemetry } from '../../../infrastructure/observability/operational-telemetry'
import type { AppConfig } from '../../config/environment'
import { errorHandler, notFound, requestId } from './middleware/errors'

export function createApp(
  config: AppConfig,
  routes?: Router,
  reportError?: (event: { event: string; requestId: string }) => void,
  telemetry?: OperationalTelemetry,
  readinessCheck?: () => Promise<boolean>,
) {
  const app = express()
  app.disable('x-powered-by')
  app.use(requestId)
  if (telemetry) app.use(telemetry.http)
  app.get('/health/live', (_req, res) => res.json({ status: 'alive' }))
  app.get('/health/ready', async (_req, res) => {
    let ready = false
    try {
      ready = (await readinessCheck?.()) ?? false
    } catch {
      ready = false
    }
    telemetry?.readinessResult(ready, res.locals.requestId)
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? 'ready' : 'unavailable' })
  })
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !!origin && config.corsOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-CSRF-Token',
        'X-Request-Id',
        'Idempotency-Key',
      ],
      exposedHeaders: ['X-Request-Id'],
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  if (routes) app.use('/v1', routes)
  app.use(notFound)
  app.use(errorHandler(reportError))
  return app
}
