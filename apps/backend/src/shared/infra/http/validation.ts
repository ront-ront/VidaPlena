import { ApplicationError } from '../../../application/errors/application-error'

export function uuidField(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field]
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalidField(field, 'Informe um identificador válido.')
  return value
}

export function invalidField(field: string, reason: string): never {
  throw new ApplicationError('VALIDATION_ERROR', [{ field, reason }])
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalidField('body', 'Envie um objeto com os campos solicitados.')
  return value as Record<string, unknown>
}

export function textField(
  body: Record<string, unknown>,
  field: string,
  maxLength = 255,
): string {
  const value = body[field]
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength)
    invalidField(field, `Informe um texto entre 1 e ${maxLength} caracteres.`)
  return value.trim()
}

export function enumField<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  const value = body[field]
  if (typeof value !== 'string' || !values.includes(value as T))
    invalidField(field, 'Selecione uma opção válida.')
  return value as T
}
