import { OnsiteConsentForm } from '@/components/onsite-consent-form'

export default async function ExistingOnsiteConsentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <OnsiteConsentForm mode="existing" patientId={id} />
}
