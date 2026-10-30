import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FileDownloadTokens } from '../../application/ports/files'

const uuid = /^[a-f0-9-]{36}$/i
export class HmacFileDownloadTokens implements FileDownloadTokens {
  constructor(private readonly key: Buffer) {
    if (key.length < 32) throw new Error('Chave de link insuficiente.')
  }
  issue(input: {
    fileId: string
    userId: string
    sessionId: string
    expiresAt: Date
  }) {
    const body = Buffer.from(
      JSON.stringify({
        fileId: input.fileId,
        userId: input.userId,
        sessionId: input.sessionId,
        expiresAt: input.expiresAt.getTime(),
      }),
    ).toString('base64url')
    const mac = createHmac('sha256', this.key).update(body).digest('base64url')
    return `${body}.${mac}`
  }
  verify(token: string, now: Date) {
    const parts = token.split('.')
    if (parts.length !== 2 || parts.some((part) => part.length > 512))
      return null
    const [body, mac] = parts
    const expected = createHmac('sha256', this.key)
      .update(body)
      .digest('base64url')
    const provided = Buffer.from(mac)
    const correct = Buffer.from(expected)
    if (
      provided.length !== correct.length ||
      !timingSafeEqual(provided, correct)
    )
      return null
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      if (
        !uuid.test(parsed.fileId) ||
        !uuid.test(parsed.userId) ||
        !uuid.test(parsed.sessionId) ||
        !Number.isSafeInteger(parsed.expiresAt) ||
        parsed.expiresAt <= now.getTime()
      )
        return null
      return {
        fileId: parsed.fileId as string,
        userId: parsed.userId as string,
        sessionId: parsed.sessionId as string,
      }
    } catch {
      return null
    }
  }
}
