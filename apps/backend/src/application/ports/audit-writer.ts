export interface AuditContext {
  actorUserId?: string
  actorRoles: string[]
  requestId: string
  originIp?: string
  originClient?: string
  authorizationBasis: string
}

export interface AuditInput extends AuditContext {
  action: string
  resourceType: string
  resourceId: string
  subjectPatientId?: string
  metadata?: Record<string, unknown>
}

export interface AuditWriter {
  append(input: AuditInput): Promise<string>
}

// Only technical, bounded values; callers cannot put arbitrary clinical text in logs.
export function safeAuditMetadata(input: Record<string, unknown> = {}) {
  const result: Record<string, string | number | boolean> = {}
  for (const key of [
    'status',
    'channel',
    'category',
    'version',
    'reasonCode',
    'count',
    'permission',
    'role',
    'source',
    'scope',
    'fileCategory',
    'scanStatus',
  ]) {
    const value = input[key]
    if (
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      result[key] = value
    if (typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,100}$/.test(value))
      result[key] = value
  }
  return result
}

export function auditRetentionYears(value = 5) {
  if (!Number.isInteger(value) || value < 5)
    throw new Error(
      'Retenção de auditoria deve preservar o mínimo obrigatório.',
    )
  return value
}
