import { randomUUID } from 'node:crypto'
import { link, mkdir, open, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  Delivery,
  EmailSender,
  NotificationChannel,
} from '../../application/ports/notifications'

export class EmailNotificationChannel implements NotificationChannel {
  readonly name = 'email'
  constructor(private readonly sender: EmailSender) {}
  deliver(message: Delivery) {
    return this.sender.send(message)
  }
}
export class PortalNotificationChannel implements NotificationChannel {
  readonly name = 'portal'
  // The transaction's sent row is the portal delivery; no external side effect.
  async deliver(_message: Delivery) {}
}
export class StubNotificationChannel implements NotificationChannel {
  constructor(readonly name: 'sms' | 'whatsapp') {}
  async deliver(_message: Delivery): Promise<void> {
    throw new Error('Canal fora do escopo V1.')
  }
}
export class DevEmailSender implements EmailSender {
  private readonly directory: string
  constructor(
    directory: string,
    environment: string,
    private readonly frontendOrigin: string,
  ) {
    if (!['development', 'test'].includes(environment))
      throw new Error('Caixa de e-mail dev não é permitida neste ambiente.')
    const url = new URL(frontendOrigin)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== frontendOrigin
    )
      throw new Error('Origem do frontend inválida.')
    this.directory = resolve(directory)
  }
  async send(message: Delivery) {
    if (!/^[a-f0-9-]{36}$/i.test(message.idempotencyKey))
      throw new Error('Identificador de entrega inválido.')
    const paths: Record<string, string> = {
      'account.invited': '/convite',
      'auth.password_reset': '/redefinir-senha',
      'contact.verification_requested': '/confirmar-email',
    }
    const path = paths[message.template]
    const actionUrl =
      path && message.token
        ? `${this.frontendOrigin}${path}?token=${encodeURIComponent(message.token)}`
        : undefined
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = join(this.directory, `${randomUUID()}.tmp`)
    const target = join(this.directory, `${message.idempotencyKey}.json`)
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(
          JSON.stringify({ to: message.to, text: message.text, actionUrl }),
        )
        await file.sync()
      } finally {
        await file.close()
      }
      try {
        await link(temporary, target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }
}
