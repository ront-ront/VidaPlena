import { createHmac, hkdfSync } from 'node:crypto'
import type { CommandFingerprint } from '../../application/ports/evolution-drafts'
export class HmacCommandFingerprint implements CommandFingerprint {
  private readonly key: Buffer
  constructor(masterKey: Buffer) {
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        'vidaplena-v1',
        'clinical-draft-command',
        32,
      ),
    )
  }
  of(value: string) {
    return createHmac('sha256', this.key).update(value).digest('hex')
  }
}
