import type { ReactNode } from 'react'
import { ClinicalRecordShell } from '@/components/clinical/clinical-record-shell'
export default async function PatientRecordLayout({
  params,
  children,
}: {
  params: Promise<{ patientId: string }>
  children: ReactNode
}) {
  const { patientId } = await params
  return (
    <ClinicalRecordShell key={patientId} patientId={patientId}>
      {children}
    </ClinicalRecordShell>
  )
}
