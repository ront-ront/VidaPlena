import { createHash } from 'node:crypto'
import { ApplicationError } from '../../application/errors/application-error'
import type {
  SignatureEvidence,
  SignatureProvider,
} from '../../application/ports/signature-provider'
export class DevSignatureProvider implements SignatureProvider {
  readonly kind = 'dev'
  readonly developmentOnly = true
  constructor(private readonly environment: string) {
    if (!['development', 'test'].includes(environment))
      throw new Error('Assinatura simulada bloqueada neste ambiente.')
  }
  available() {
    return ['development', 'test'].includes(this.environment)
  }
  async sign(
    input: Parameters<SignatureProvider['sign']>[0],
  ): Promise<SignatureEvidence> {
    if (!this.available()) throw new ApplicationError('SERVICE_UNAVAILABLE')
    return {
      provider: this.kind,
      level: input.level,
      signer: input.signer,
      signedAt: input.signedAt.toISOString(),
      version: 'dev-v1',
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      legalValidity: false,
      seal: 'sem validade jurídica',
    }
  }
}
export class DisabledSignatureProvider implements SignatureProvider {
  readonly kind = 'disabled'
  readonly developmentOnly = false
  available() {
    return false
  }
  async sign(): Promise<SignatureEvidence> {
    throw new ApplicationError('SERVICE_UNAVAILABLE')
  }
}
