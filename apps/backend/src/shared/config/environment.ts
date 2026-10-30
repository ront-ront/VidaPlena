import { z } from 'zod'

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super(`Configuração inválida: ${fields.join(', ')}. Confira o ambiente.`)
    this.name = 'ConfigurationError'
  }
}

const requiredText = z.string().trim().min(1)
const provider = z.enum(['dev', 'disabled'])
const origin = requiredText
  .pipe(z.url({ protocol: /^https?$/ }))
  .refine(
    (value) => URL.canParse(value) && new URL(value).origin === value,
    'Informe apenas a origem, sem caminho, credenciais ou query.',
  )
const integer = (fallback: number, minimum: number, maximum: number) =>
  requiredText
    .transform((value) => Number(value))
    .pipe(z.number().int().min(minimum).max(maximum))
    .default(fallback)

export const environmentSchema = z
  .object({
    APP_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    ENVIRONMENT_ID: requiredText.optional(),
    DATA_REGION_COUNTRY: requiredText.optional(),
    HOST: requiredText.default('127.0.0.1'),
    PORT: integer(3333, 1, 65535),
    AUTH_PASSWORD_MIN_LENGTH: integer(10, 1, 72),
    AUTH_PASSWORD_COMMON_LIST_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AUTH_BCRYPT_ROUNDS: integer(12, 10, 16),
    AUTH_ACCESS_TOKEN_MINUTES: integer(15, 1, 1440),
    AUTH_REFRESH_TOKEN_DAYS: integer(7, 1, 90),
    AUTH_INTERNAL_IDLE_MINUTES: integer(30, 1, 1440),
    AUTH_PATIENT_IDLE_MINUTES: integer(60, 1, 1440),
    AUTH_FAILED_LOGIN_LIMIT: integer(5, 1, 100),
    AUTH_LOCK_MINUTES: integer(15, 1, 1440),
    AUTH_MFA_METHOD: z.literal('TOTP').default('TOTP'),
    AUTH_MFA_CHALLENGE_MINUTES: integer(5, 1, 30),
    AUTH_REQUESTS_PER_MINUTE: integer(30, 1, 1000),
    AUTH_RESET_LINK_MINUTES: integer(30, 1, 1440),
    AUTH_EMAIL_VERIFY_LINK_HOURS: integer(48, 1, 720),
    AUTH_RESET_REQUESTS_PER_HOUR: integer(3, 1, 100),
    AUTH_PASSWORD_HISTORY_COUNT: integer(5, 1, 20),
    PATIENT_LEGAL_ADULT_AGE_YEARS: integer(18, 16, 21),
    AUTH_INVITE_LINK_HOURS: integer(48, 1, 720),
    ACCOUNT_INACTIVITY_REVIEW_DAYS: integer(90, 1, 3650),
    DATABASE_URL: requiredText.pipe(z.url({ protocol: /^postgres(?:ql)?$/ })),
    CORS_ORIGINS: requiredText
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(origin).min(1)),
    JWT_SECRET: requiredText.refine(
      (value) => Buffer.byteLength(value) >= 32,
      'Segredo insuficiente.',
    ),
    FILE_ENCRYPTION_KEY: requiredText
      .pipe(z.base64())
      .refine((value) => {
        const key = Buffer.from(value, 'base64')
        return key.length === 32 && key.toString('base64') === value
      }, 'Informe chave base64 canônica de 32 bytes.')
      .transform((value) => Buffer.from(value, 'base64')),
    SIGNATURE_PROVIDER: provider.default('dev'),
    MALWARE_SCANNER: provider.default('dev'),
    EMAIL_SENDER: provider.optional(),
    EMAIL_MAILBOX_PATH: requiredText.default('var/mailbox'),
    FRONTEND_ORIGIN: origin.optional(),
    SHUTDOWN_TIMEOUT_MS: integer(10000, 1, 120000),
    AUDIT_RETENTION_YEARS: integer(5, 5, Number.MAX_SAFE_INTEGER),
    NOTIFICATION_RETRY_SECONDS: integer(60, 1, 86400),
    NOTIFICATION_MAX_ATTEMPTS: integer(3, 1, 100),
    NOTIFICATION_POLL_SECONDS: integer(5, 1, 3600),
    FILE_STORAGE_PATH: requiredText.default('var/files'),
    FILE_ATTACHMENT_MAX_MB: integer(10, 1, 1024),
    FILE_RESULT_MAX_MB: integer(20, 1, 1024),
    FILE_RECORDING_MAX_MB: integer(500, 1, 2048),
    FILE_RECORDING_MAX_MINUTES: integer(60, 1, 720),
    FILE_MAX_PER_RECORD: integer(10, 1, 100),
    FILE_SIGNED_URL_TTL_SECONDS: integer(120, 1, 3600),
    FILE_ORPHAN_RECONCILE_MINUTES: integer(60, 5, 10080),
    PRIVACY_SUBJECT_REQUEST_DAYS: integer(15, 1, 365),
    OPS_SLOW_REQUEST_MS: integer(2000, 100, 120000),
    OPS_READINESS_TIMEOUT_MS: integer(2000, 100, 30000),
    OPS_ALERTS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    OPS_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    OPS_MAINTENANCE_MAX_HOURS_MONTH: integer(2, 1, 24),
    OPS_MAINTENANCE_NOTICE_HOURS: integer(48, 1, 720),
  })
  .superRefine((env, ctx) => {
    const reject = (field: string) =>
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'Configuração incompatível com o ambiente.',
      })
    const deployed = env.APP_ENV === 'staging' || env.APP_ENV === 'production'
    if (env.ENVIRONMENT_ID && !env.ENVIRONMENT_ID.startsWith(`${env.APP_ENV}-`))
      reject('ENVIRONMENT_ID')
    if (env.FRONTEND_ORIGIN && !env.CORS_ORIGINS.includes(env.FRONTEND_ORIGIN))
      reject('FRONTEND_ORIGIN')
    if (deployed) {
      if (!env.ENVIRONMENT_ID) reject('ENVIRONMENT_ID')
      if (env.DATA_REGION_COUNTRY !== 'BR') reject('DATA_REGION_COUNTRY')
      if (env.CORS_ORIGINS.some((value) => !value.startsWith('https://')))
        reject('CORS_ORIGINS')
      for (const field of [
        'SIGNATURE_PROVIDER',
        'MALWARE_SCANNER',
        'EMAIL_SENDER',
      ] as const) {
        if (env[field] === 'dev') reject(field)
      }
    }
  })
  .transform((env) => {
    const deployed = env.APP_ENV === 'staging' || env.APP_ENV === 'production'
    return {
      environment: env.APP_ENV,
      environmentId: env.ENVIRONMENT_ID ?? `${env.APP_ENV}-local`,
      host: env.HOST,
      port: env.PORT,
      passwordMinLength: env.AUTH_PASSWORD_MIN_LENGTH,
      passwordCommonListEnabled: env.AUTH_PASSWORD_COMMON_LIST_ENABLED,
      bcryptRounds: env.AUTH_BCRYPT_ROUNDS,
      accessTokenMinutes: env.AUTH_ACCESS_TOKEN_MINUTES,
      refreshTokenDays: env.AUTH_REFRESH_TOKEN_DAYS,
      internalIdleMinutes: env.AUTH_INTERNAL_IDLE_MINUTES,
      patientIdleMinutes: env.AUTH_PATIENT_IDLE_MINUTES,
      failedLoginLimit: env.AUTH_FAILED_LOGIN_LIMIT,
      lockMinutes: env.AUTH_LOCK_MINUTES,
      mfaMethod: env.AUTH_MFA_METHOD,
      mfaChallengeMinutes: env.AUTH_MFA_CHALLENGE_MINUTES,
      authRequestsPerMinute: env.AUTH_REQUESTS_PER_MINUTE,
      resetLinkMinutes: env.AUTH_RESET_LINK_MINUTES,
      emailVerifyLinkHours: env.AUTH_EMAIL_VERIFY_LINK_HOURS,
      resetRequestsPerHour: env.AUTH_RESET_REQUESTS_PER_HOUR,
      passwordHistoryCount: env.AUTH_PASSWORD_HISTORY_COUNT,
      patientLegalAdultAgeYears: env.PATIENT_LEGAL_ADULT_AGE_YEARS,
      inviteLinkHours: env.AUTH_INVITE_LINK_HOURS,
      accountInactivityReviewDays: env.ACCOUNT_INACTIVITY_REVIEW_DAYS,
      databaseUrl: env.DATABASE_URL,
      corsOrigins: env.CORS_ORIGINS,
      jwtSecret: env.JWT_SECRET,
      encryptionKey: env.FILE_ENCRYPTION_KEY,
      cookieSecure: deployed,
      cookieSameSite: 'lax' as const,
      signatureProvider: env.SIGNATURE_PROVIDER,
      malwareScanner: env.MALWARE_SCANNER,
      shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
      auditRetentionYears: env.AUDIT_RETENTION_YEARS,
      emailSender:
        env.EMAIL_SENDER ??
        (deployed ? ('disabled' as const) : ('dev' as const)),
      emailMailboxPath: env.EMAIL_MAILBOX_PATH,
      frontendOrigin: env.FRONTEND_ORIGIN ?? env.CORS_ORIGINS[0],
      notificationRetrySeconds: env.NOTIFICATION_RETRY_SECONDS,
      notificationMaxAttempts: env.NOTIFICATION_MAX_ATTEMPTS,
      notificationPollSeconds: env.NOTIFICATION_POLL_SECONDS,
      fileStoragePath: env.FILE_STORAGE_PATH,
      fileAttachmentMaxMb: env.FILE_ATTACHMENT_MAX_MB,
      fileResultMaxMb: env.FILE_RESULT_MAX_MB,
      fileRecordingMaxMb: env.FILE_RECORDING_MAX_MB,
      fileRecordingMaxMinutes: env.FILE_RECORDING_MAX_MINUTES,
      fileMaxPerRecord: env.FILE_MAX_PER_RECORD,
      fileSignedUrlTtlSeconds: env.FILE_SIGNED_URL_TTL_SECONDS,
      fileOrphanReconcileMinutes: env.FILE_ORPHAN_RECONCILE_MINUTES,
      subjectRequestDays: env.PRIVACY_SUBJECT_REQUEST_DAYS,
      opsSlowRequestMs: env.OPS_SLOW_REQUEST_MS,
      opsReadinessTimeoutMs: env.OPS_READINESS_TIMEOUT_MS,
      opsAlertsEnabled: env.OPS_ALERTS_ENABLED,
      opsLogLevel: env.OPS_LOG_LEVEL,
      opsMaintenanceMaxHoursMonth: env.OPS_MAINTENANCE_MAX_HOURS_MONTH,
      opsMaintenanceNoticeHours: env.OPS_MAINTENANCE_NOTICE_HOURS,
    }
  })

export type AppConfig = z.output<typeof environmentSchema>

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(env)
  // ZodError can contain received values: expose only field names, never the error itself.
  if (!parsed.success)
    throw new ConfigurationError([
      ...new Set(
        parsed.error.issues.map((issue) => String(issue.path[0] ?? 'ENV')),
      ),
    ])
  return parsed.data
}
