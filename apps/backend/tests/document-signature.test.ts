import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { JcsCanonicalDocuments } from '../src/infrastructure/documents/canonical-documents'
import {
  DevSignatureProvider,
  DisabledSignatureProvider,
} from '../src/infrastructure/documents/dev-signature-provider'
import {
  ConfigurationError,
  loadConfig,
} from '../src/shared/config/environment'

test('BE-038: canonicalização RFC8785 é estável por ordem de chaves e recusa valores inválidos', () => {
  const canonical = new JcsCanonicalDocuments()
  const a = canonical.serialize({
      z: 1,
      a: { b: 'acentuação', a: [1, true, null] },
    }),
    b = canonical.serialize({
      a: { a: [1, true, null], b: 'acentuação' },
      z: 1,
    })
  assert.equal(a, b)
  assert.equal(canonical.sha256(a), canonical.sha256(b))
  assert.throws(() => canonical.serialize({ invalid: Number.NaN }))
  assert.throws(() => canonical.serialize(undefined))
})
test('BE-038: provider dev simula nível solicitado com selo e falha fora de desenvolvimento', async () => {
  const canonical = new JcsCanonicalDocuments(),
    provider = new DevSignatureProvider('test'),
    text = canonical.serialize({ body: 'Teste fictício' }),
    signedAt = new Date(),
    signer = {
      id: 'professional-test',
      name: 'Profissional fictício',
      council: { type: 'CRM', region: 'CE', number: 'TEST' },
    }
  for (const level of ['simple', 'qualified'] as const) {
    const evidence = await provider.sign({
      bytes: canonical.bytes(text),
      signer,
      level,
      signedAt,
      payloadVersion: 1,
    })
    assert.equal(evidence.sha256, canonical.sha256(text))
    assert.equal(evidence.level, level)
    assert.equal(evidence.legalValidity, false)
    assert.equal(evidence.seal, 'sem validade jurídica')
    assert.equal(evidence.version, 'dev-v1')
    assert.equal(evidence.signedAt, signedAt.toISOString())
  }
  for (const environment of ['staging', 'production'])
    assert.throws(() => new DevSignatureProvider(environment))
  const disabled = new DisabledSignatureProvider()
  assert.equal(disabled.available(), false)
  await assert.rejects(disabled.sign())
})
test('BE-038: Zod bloqueia assinatura dev em produção e valida limite de verificação', () => {
  const env = {
    APP_ENV: 'production',
    ENVIRONMENT_ID: 'production-br',
    DATA_REGION_COUNTRY: 'BR',
    DATABASE_URL: 'postgresql://example:example@localhost/production',
    CORS_ORIGINS: 'https://vida.example',
    JWT_SECRET: randomBytes(32).toString('hex'),
    FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SIGNATURE_PROVIDER: 'disabled',
    MALWARE_SCANNER: 'disabled',
  }
  assert.equal(loadConfig(env).signatureProvider, 'disabled')
  assert.throws(
    () => loadConfig({ ...env, SIGNATURE_PROVIDER: 'dev' }),
    (error: unknown) =>
      error instanceof ConfigurationError &&
      error.fields.includes('SIGNATURE_PROVIDER'),
  )
  assert.throws(
    () => loadConfig({ ...env, DOCUMENT_VERIFY_REQUESTS_PER_MINUTE: '0' }),
    ConfigurationError,
  )
  assert.equal(
    loadConfig({ ...env, DOCUMENT_VERIFY_REQUESTS_PER_MINUTE: '2' })
      .documentVerifyRequestsPerMinute,
    2,
  )
})
