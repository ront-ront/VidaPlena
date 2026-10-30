import type { Prisma } from '../../../generated/prisma/client'

type ConsentDb = Pick<
  Prisma.TransactionClient,
  'consentDocumentVersion' | 'consentEvent'
>

export async function currentDataDocument(db: ConsentDb, now = new Date()) {
  return db.consentDocumentVersion.findFirst({
    where: { kind: 'data', effectiveAt: { lte: now } },
    orderBy: [{ effectiveAt: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
  })
}

export async function dataConsentState(
  db: ConsentDb,
  patientId: string,
  now = new Date(),
) {
  const document = await currentDataDocument(db, now)
  if (!document) return 'pending' as const
  const event = await db.consentEvent.findFirst({
    where: { patientId, documentVersion: { kind: 'data' } },
    orderBy: { sequence: 'desc' },
  })
  if (event?.action === 'revoke') return 'revoked' as const
  if (event?.action === 'accept' && event.documentVersionId === document.id)
    return 'active' as const
  return 'pending' as const
}

export async function userDataConsentState(
  db: ConsentDb & Pick<Prisma.TransactionClient, 'patientProfile'>,
  userId: string,
  now = new Date(),
) {
  const patient = await db.patientProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!patient) return 'pending' as const
  return dataConsentState(db, patient.id, now)
}
