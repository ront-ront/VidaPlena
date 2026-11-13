import { parse } from 'csv-parse/sync'
import type { PatientCsvParser } from '../../application/ports/patient-imports'

const header = [
  'external_id',
  'full_name',
  'birth_date',
  'cpf',
  'email',
  'phone',
  'source_system',
]
export class CsvParsePatientParser implements PatientCsvParser {
  constructor(private readonly columns: readonly string[] = header) {}
  parse(file: Buffer, maxRows: number) {
    const header = this.columns
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file)
    } catch {
      return { rows: [], fileErrors: ['INVALID_UTF8'] }
    }
    if (text.includes('\0')) return { rows: [], fileErrors: ['BINARY_CONTENT'] }
    try {
      const records = parse(text, {
        delimiter: ';',
        bom: true,
        skip_empty_lines: true,
        info: true,
        to: maxRows + 2,
        max_record_size: Math.max(file.length, 1),
      }) as Array<{ record: string[]; info: { lines: number } }>
      if (!records.length) return { rows: [], fileErrors: ['EMPTY_FILE'] }
      if (
        records[0].record.length !== header.length ||
        records[0].record.some((field, i) => field !== header[i])
      )
        return { rows: [], fileErrors: ['INVALID_HEADER'] }
      if (records.length > maxRows + 1)
        return { rows: [], fileErrors: ['ROW_LIMIT'] }
      if (records.some((row) => row.record.length !== header.length))
        return { rows: [], fileErrors: ['INVALID_COLUMN_COUNT'] }
      return {
        rows: records
          .slice(1)
          .map((row) => ({ line: row.info.lines, values: row.record })),
        fileErrors: [],
      }
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : null
      return {
        rows: [],
        fileErrors: [
          code === 'CSV_RECORD_INCONSISTENT_FIELDS_LENGTH'
            ? 'INVALID_COLUMN_COUNT'
            : 'MALFORMED_CSV',
        ],
      }
    }
  }
}
