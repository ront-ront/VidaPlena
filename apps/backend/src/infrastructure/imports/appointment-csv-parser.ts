import { CsvParsePatientParser } from './patient-csv-parser'
export class CsvParseAppointmentParser extends CsvParsePatientParser {
  constructor() {
    super([
      'external_id',
      'patient_cpf',
      'professional_external_id',
      'specialty_code',
      'room_name',
      'starts_at',
      'ends_at',
      'modality',
      'visit_type',
      'status',
      'source_system',
    ])
  }
}
