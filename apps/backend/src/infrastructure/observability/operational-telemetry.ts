import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client'
import type { RequestHandler } from 'express'
import pino, { type Logger } from 'pino'

type AlertKind = 'http_5xx' | 'slow_request' | 'readiness_failed' | 'job_failed'
type JobName = 'consent_evidence_reconcile'

function methodLabel(value: string) {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(value)
    ? value
    : 'OTHER'
}

function routeLabel(value: unknown) {
  return typeof value === 'string' &&
    /^\/[a-zA-Z0-9_:/{}.-]{1,120}$/.test(value)
    ? value
    : 'unmatched'
}

export class OperationalTelemetry {
  readonly registry = new Registry()
  private readonly requests = new Counter({
    name: 'vidaplena_http_requests_total',
    help: 'HTTP requests by route and status',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  })
  private readonly latency = new Histogram({
    name: 'vidaplena_http_duration_seconds',
    help: 'HTTP request duration by route and status',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16],
    registers: [this.registry],
  })
  private readonly readiness = new Gauge({
    name: 'vidaplena_readiness',
    help: 'Latest readiness result (1 ready, 0 unavailable)',
    registers: [this.registry],
  })
  private readonly jobs = new Counter({
    name: 'vidaplena_jobs_total',
    help: 'Background job outcomes',
    labelNames: ['job', 'status'],
    registers: [this.registry],
  })
  private readonly notificationBacklog = new Gauge({
    name: 'vidaplena_notification_backlog',
    help: 'Queued and retrying notification deliveries',
    registers: [this.registry],
  })
  private readonly alerts = new Counter({
    name: 'vidaplena_operational_alerts_total',
    help: 'Operational alert events',
    labelNames: ['kind'],
    registers: [this.registry],
  })

  constructor(
    private readonly logger: Logger,
    private readonly options: { slowRequestMs: number; alertsEnabled: boolean },
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'vidaplena_' })
    this.readiness.set(0)
  }

  static create(options: {
    slowRequestMs: number
    alertsEnabled: boolean
    logLevel: 'debug' | 'info' | 'warn' | 'error'
  }) {
    return new OperationalTelemetry(
      pino({
        level: options.logLevel,
        base: undefined,
        redact: {
          paths: [
            'password',
            'token',
            'authorization',
            'cpf',
            'body',
            'payload',
          ],
          remove: true,
        },
      }),
      options,
    )
  }

  readonly http: RequestHandler = (req, res, next) => {
    const started = performance.now()
    res.once('finish', () => {
      const durationMs = Math.max(0, performance.now() - started)
      const route = routeLabel(req.route?.path)
      const method = methodLabel(req.method)
      const status = String(res.statusCode)
      this.requests.inc({ method, route, status })
      this.latency.observe({ method, route, status }, durationMs / 1000)
      this.logger.info({
        event: 'http.request',
        requestId: res.locals.requestId,
        route,
        method,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      })
      if (res.statusCode >= 500) this.alert('http_5xx', res.locals.requestId)
      if (durationMs >= this.options.slowRequestMs)
        this.alert('slow_request', res.locals.requestId)
    })
    next()
  }

  unexpectedError(event: { event: string; requestId: string }) {
    this.logger.error(event)
  }

  readinessResult(ready: boolean, requestId: string) {
    this.readiness.set(ready ? 1 : 0)
    this.logger.info({
      event: 'health.readiness',
      requestId,
      status: ready ? 'ready' : 'unavailable',
    })
    if (!ready) this.alert('readiness_failed', requestId)
  }

  jobResult(job: JobName, status: 'succeeded' | 'failed', count: number) {
    this.jobs.inc({ job, status })
    this.logger.info({ event: 'job.finished', job, status, count })
    if (status === 'failed') this.alert('job_failed')
  }

  setNotificationBacklog(count: number) {
    this.notificationBacklog.set(count)
  }

  private alert(kind: AlertKind, requestId?: string) {
    this.alerts.inc({ kind })
    if (this.options.alertsEnabled)
      this.logger.warn({ event: 'ops.alert', kind, requestId })
  }

  async metrics() {
    return this.registry.metrics()
  }
  contentType() {
    return this.registry.contentType
  }
}
