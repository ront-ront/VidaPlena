import { z } from 'zod'

const memory = new Map<string, string>()
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export async function bookingCommand(
  actorId: string,
  input: {
    patientId: string
    professionalId: string
    specialtyId: string
    modality: string
    visitType: string
    startsAt: string
    confirmDuplicateSpecialty?: boolean
  },
  storage?: StoragePort,
): Promise<{ key: string; persisted: boolean }> {
  return commandNonce(
    [
      actorId,
      input.patientId,
      input.professionalId,
      input.specialtyId,
      input.modality,
      input.visitType,
      input.startsAt,
      input.confirmDuplicateSpecialty === true,
    ],
    storage,
  )
}
export async function commandNonce(
  values: readonly unknown[],
  storage?: StoragePort,
): Promise<{ key: string; persisted: boolean }> {
  const canonical = JSON.stringify(values)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  )
  const fingerprint = `vp-booking-command:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  let target = storage
  try {
    target ??= typeof window === 'undefined' ? undefined : window.sessionStorage
    const saved = z.uuid().safeParse(target?.getItem(fingerprint))
    if (saved.success) return { key: saved.data, persisted: true }
  } catch {
    target = undefined
  }
  const key = memory.get(fingerprint) ?? crypto.randomUUID()
  memory.set(fingerprint, key)
  try {
    if (target) {
      target.setItem(fingerprint, key)
      return { key, persisted: true }
    }
  } catch {}
  return { key, persisted: false }
}
