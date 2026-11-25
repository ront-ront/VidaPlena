import { z } from 'zod'
import { ApiError, apiClient } from './api-client'
export const sourceSystemSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.:-]+$/)
export const importReportSchema = z.object({
  batchId: z.uuid(),
  kind: z.enum(['patients', 'appointments']),
  clinicTimeZone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: value })
        return true
      } catch {
        return false
      }
    })
    .optional(),
  sourceSystem: z.string(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i),
  status: z.enum(['preview', 'invalid', 'processing', 'confirmed']),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid(),
  expiresAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  cutoffDate: z.iso.date().nullable(),
  fileErrors: z.array(z.string()),
  accepted: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
  imported: z.int().nonnegative(),
  existing: z.int().nonnegative(),
  replayed: z.boolean(),
  rows: z.array(
    z.object({
      line: z.int().positive(),
      status: z.enum(['accepted', 'rejected', 'imported', 'existing']),
      errors: z.array(z.string()),
      duplicateOf: z.string().optional(),
      targetId: z.uuid().optional(),
      externalId: z.string().optional(),
      fullName: z.string().optional(),
      cpfMasked: z.string().optional(),
      professionalExternalId: z.uuid().optional(),
      specialtyCode: z.string().optional(),
      roomName: z.string().optional(),
      localDate: z.iso.date().optional(),
      startsAt: z.iso.datetime().optional(),
      endsAt: z.iso.datetime().optional(),
      modality: z.enum(['onsite', 'remote']).optional(),
      appointmentStatus: z
        .enum(['confirmed', 'cancelled', 'completed'])
        .optional(),
    }),
  ),
})
export type ImportReport = z.infer<typeof importReportSchema>
export type ImportKind = 'patients' | 'appointments'
function parse(raw: unknown, kind: ImportKind) {
  const parsed = importReportSchema.safeParse(raw)
  if (
    !parsed.success ||
    parsed.data.kind !== kind ||
    (kind === 'appointments' && !parsed.data.clinicTimeZone)
  )
    throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return parsed.data
}
export const imports = {
  async preview(kind: ImportKind, sourceSystem: string, file: File) {
    const form = new FormData()
    form.append('sourceSystem', sourceSystem)
    form.append('file', file, file.name)
    try {
      return parse(
        await apiClient.request(
          `/v1/imports/${kind}/preview`,
          { method: 'POST', body: form },
          { expectedStatus: 200 },
        ),
        kind,
      )
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status === 400 &&
        cause.importReport
      )
        return parse(cause.importReport, kind)
      throw cause
    }
  },
  async confirm(report: ImportReport, key: string) {
    return parse(
      await apiClient.request(
        `/v1/imports/${report.kind}/${report.batchId}/confirm`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: JSON.stringify({ expectedFileHash: report.fileHash }),
        },
        { expectedStatus: 200 },
      ),
      report.kind,
    )
  },
  async read(kind: ImportKind, id: string) {
    return parse(await apiClient.request(`/v1/imports/${id}`), kind)
  },
}
export function importError(code: string): string {
  const labels: Record<string, string> = {
    SLOT_UNAVAILABLE:
      'Intervalo indisponível: profissional ou sala já ocupado, bloqueado ou fora da grade. Confira a agenda do dia.',
    PATIENT_NOT_FOUND:
      'Paciente não cadastrado. Importe ou cadastre o paciente antes.',
    PATIENT_INACTIVE: 'Paciente inativo.',
    CONSENT_REVOKED: 'Consentimento revogado; atendimento não importado.',
    PROFESSIONAL_NOT_FOUND: 'Profissional não encontrado.',
    SPECIALTY_NOT_FOUND: 'Especialidade não encontrada.',
    ROOM_NOT_FOUND: 'Sala não encontrada.',
    INVALID_ROOM_NAME:
      'Presencial exige sala cadastrada; remoto exige sala vazia.',
    INVALID_DURATION:
      'Duração diferente da duração cadastrada na especialidade.',
    INVALID_INTERVAL: 'O início deve ser anterior ao fim.',
    INVALID_STATUS_TIME: 'Status incompatível com a data do atendimento.',
    INVALID_PROFESSIONAL_EXTERNAL_ID:
      'Use o UUID do profissional cadastrado, não uma chave legada.',
    INVALID_STARTS_AT: 'Início inválido: use timestamp ISO 8601 com fuso.',
    INVALID_ENDS_AT: 'Fim inválido: use timestamp ISO 8601 com fuso.',
    INVALID_UTF8: 'Use codificação UTF-8.',
    INVALID_HEADER: 'Confira o cabeçalho e a ordem das colunas.',
    INVALID_COLUMN_COUNT: 'Quantidade de colunas diferente do cabeçalho.',
    BINARY_CONTENT: 'Conteúdo binário não é aceito.',
    EMPTY_FILE: 'O arquivo está vazio.',
    ROW_LIMIT: 'Quantidade de linhas acima do limite configurado.',
    MALFORMED_CSV: 'CSV malformado: confira aspas, separador e linhas.',
    DUPLICATE_CPF: 'CPF já cadastrado.',
    DUPLICATE_CPF_FILE: 'CPF repetido neste arquivo.',
    DUPLICATE_EXTERNAL_ID_FILE: 'Identificador externo repetido neste arquivo.',
    SOURCE_SYSTEM_MISMATCH: 'Origem da linha diferente da origem informada.',
    SOURCE_KEY_CONFLICT:
      'Registro já importado com conteúdo diferente; não será sobrescrito.',
  }
  if (labels[code]) return labels[code]
  if (code.startsWith('INVALID_'))
    return 'Campo inválido: confira os dados e o formato desta linha.'
  return 'Linha recusada. Revise o arquivo antes de tentar novamente.'
}
