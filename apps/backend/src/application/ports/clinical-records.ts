import type { Principal } from '../../domain/rules/access'
import type { CareAppointment } from '../../domain/rules/care-link'
import type { AuditContext } from './audit-writer'
import type { ClinicalAlertView } from './clinical-alerts'
import type { EmergencyAccessTransaction } from './emergency-access'
export const timelineTypes = [
  'encounter',
  'evolution',
  'prescription',
  'exam_order',
  'exam_result',
  'document',
  'imported_history',
] as const
export type TimelineType = (typeof timelineTypes)[number]
export type TimelineQuery = {
  from?: string
  to?: string
  specialtyId?: string
  type?: TimelineType
  cursor?: string
}
export type ClinicalRecord = {
  id: string
  patientId: string
  recordNumber: string
  createdAt: Date
}
export type ClinicalEncounter = {
  id: string
  appointmentId: string
  recordId: string
  professionalId: string
  status: string
  startedAt: Date
  endedAt: Date | null
}
export type TimelineItem = {
  id: string
  resourceId: string
  type: TimelineType
  date: string
  specialty: { id: string; name: string } | null
  professional: { id: string; name: string } | null
  modality: 'onsite' | 'remote' | null
  summary: string
  importedOrigin: {
    origin: string
    importedAt: string
    importedBy: string
  } | null
}
export type ClinicalTimelineInput = {
  recordId: string
  resourceId: string
  type: Exclude<TimelineType, 'encounter'>
  occurredAt: Date
  professionalId: string | null
  specialtyId: string | null
  modality: 'onsite' | 'remote' | null
  summary: string
  importedOrigin?: NonNullable<TimelineItem['importedOrigin']>
}
export interface ClinicalRecordTransaction extends EmergencyAccessTransaction {
  record(patientId: string): Promise<ClinicalRecord>
  appendTimeline(input: ClinicalTimelineInput): Promise<{ id: string }>
  identification(
    patientId: string,
  ): Promise<{ id: string; name: string; birthDate: string } | null>
  lastEncounterAt(patientId: string): Promise<Date | null>
  hasHistory(record: ClinicalRecord): Promise<boolean>
  currentEncounter(
    recordId: string,
    professionalId: string,
  ): Promise<ClinicalEncounter | null>
  timeline(
    record: ClinicalRecord,
    query: TimelineQuery,
  ): Promise<{ items: TimelineItem[]; nextCursor: string | null }>
  // Critical alerts are visible even in the restricted pre-consultation header.
  criticalAlerts(patientId: string): Promise<ClinicalAlertView[]>
  lockAppointment(id: string): Promise<void>
  clinicalAppointment(id: string): Promise<CareAppointment | null>
  encounterByAppointment(id: string): Promise<ClinicalEncounter | null>
  startEncounter(
    record: ClinicalRecord,
    appointment: CareAppointment,
    actor: Principal,
    now: Date,
    context: AuditContext,
  ): Promise<ClinicalEncounter>
}
export interface ClinicalRecordStore {
  transaction<T>(run: (tx: ClinicalRecordTransaction) => Promise<T>): Promise<T>
}
