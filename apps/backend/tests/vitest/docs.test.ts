import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/shared/config/environment'
import { createApp } from '../../src/shared/infra/http/app'
import { inviteUserBody } from '../../src/shared/infra/http/contracts/m0'
import { registerApiDocumentation } from '../../src/shared/infra/http/openapi'
import { parseInput } from '../../src/shared/infra/http/parse-input'

const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://local:local@localhost/test',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
})

describe('documentação e validação de entrada M0', () => {
  const routes = Router()
  registerApiDocumentation(routes)
  routes.post('/contract-example', (req, res) =>
    res.status(201).json(parseInput(inviteUserBody, req.body)),
  )
  const app = createApp(config, routes)

  it('serve OpenAPI 3.1 gerado dos schemas e Scalar', async () => {
    const document = await request(app).get('/v1/openapi.json').expect(200)
    expect(document.body.openapi).toBe('3.1.0')
    expect(document.body.paths['/admin/users'].post.requestBody).toBeDefined()
    expect(
      document.body.paths['/patient-registrations'].post.requestBody,
    ).toBeDefined()
    expect(
      document.body.paths['/patients'].post.requestBody.content[
        'multipart/form-data'
      ],
    ).toBeDefined()
    expect(
      document.body.paths['/me/consents/revoke'].post.responses['201'],
    ).toBeDefined()
    const page = await request(app).get('/v1/docs').expect(200)
    expect(page.text).toContain('VidaPlena API')
  })

  it('rejeita valor inválido sem refletir o conteúdo enviado', async () => {
    const response = await request(app)
      .post('/v1/contract-example')
      .send({
        email: 'private-invalid-email',
        fullName: 'Fictícia',
        role: 'manager',
      })
      .expect(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details[0].field).toBe('email')
    expect(JSON.stringify(response.body)).not.toContain('private-invalid-email')
  })
})
