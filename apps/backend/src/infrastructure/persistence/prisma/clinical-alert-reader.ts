import type { ClinicalAlertView } from '../../../application/ports/clinical-alerts'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma } from '../../../generated/prisma/client'
export const clinicalAlertInclude = {
  author: { select: { id: true, user: { select: { fullName: true } } } },
  events: {
    orderBy: { version: 'asc' },
    include: {
      author: { select: { id: true, user: { select: { fullName: true } } } },
    },
  },
} as const satisfies Prisma.ClinicalAlertInclude
export const activeClinicalAlertFilter = {
  events: { none: { kind: 'deactivated' } },
} as const
export function projectClinicalAlert(
  row: Prisma.ClinicalAlertGetPayload<{ include: typeof clinicalAlertInclude }>,
  secrets: SecretBox,
): ClinicalAlertView {
  const payload = JSON.parse(
    secrets.open(row.payloadEncrypted, `clinical_alert:${row.id}`),
  ) as { term: string; substanceCode: string | null }
  return {
    id: row.id,
    patientId: row.patientId,
    kind: row.kind as ClinicalAlertView['kind'],
    ...payload,
    verificationState: row.events.some((e) => e.kind === 'confirmed')
      ? 'confirmed'
      : (row.verificationState as ClinicalAlertView['verificationState']),
    active: !row.events.some((e) => e.kind === 'deactivated'),
    version: row.events.at(-1)?.version ?? 1,
    author: { id: row.authorProfessionalId, name: row.author.user.fullName },
    date: row.createdAt.toISOString(),
    history: row.events.map((e) => ({
      id: e.id,
      kind: e.kind as 'created' | 'confirmed' | 'deactivated',
      version: e.version,
      author: { id: e.authorProfessionalId, name: e.author.user.fullName },
      date: e.createdAt.toISOString(),
      reason: e.reasonEncrypted
        ? secrets.open(e.reasonEncrypted, `clinical_alert_event:${e.id}`)
        : null,
    })),
  }
}
export async function readActiveClinicalAlerts(
  tx: Prisma.TransactionClient,
  patientId: string,
  secrets: SecretBox,
) {
  return (
    await tx.clinicalAlert.findMany({
      where: { patientId, ...activeClinicalAlertFilter },
      include: clinicalAlertInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  ).map((row) => {
    const { history: _, ...view } = projectClinicalAlert(row, secrets)
    return view
  })
}
