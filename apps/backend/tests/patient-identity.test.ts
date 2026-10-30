import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApplicationError } from '../src/application/errors/application-error'
import { PreparePatientRegistration } from '../src/application/use-cases/prepare-patient-registration'

const service = new PreparePatientRegistration(
  { transaction: async () => undefined as never, dependents: async () => [] },
  18,
  () => new Date('2026-10-29T12:00:00Z'),
)

test('cadastro normaliza CPF e celular e exige responsável para menor', () => {
  const adult = service.prepare(
    {
      fullName: '  Maria Exemplo  ',
      birthDate: '2000-02-29',
      cpf: '529.982.247-25',
      phone: '(85) 99999-9999',
      email: 'MARIA@example.test',
    },
    'self',
  )
  assert.equal(adult.cpf, '52998224725')
  assert.equal(adult.phone, '+5585999999999')
  assert.equal(adult.email, 'maria@example.test')
  assert.equal(adult.minor, false)
  for (const input of [
    { birthDate: '2015-01-01', cpf: '529.982.247-25' },
    { birthDate: '2000-02-30', cpf: '529.982.247-25' },
    { birthDate: '2000-02-29', cpf: '111.111.111-11' },
  ]) {
    assert.throws(
      () =>
        service.prepare(
          {
            fullName: 'Pessoa Exemplo',
            phone: '(85) 99999-9999',
            email: 'person@example.test',
            ...input,
          },
          'self',
        ),
      ApplicationError,
    )
  }
  const dependent = service.prepare(
    {
      fullName: 'Menor Exemplo',
      birthDate: '2015-01-01',
      cpf: '111.444.777-35',
    },
    'dependent',
  )
  assert.equal(dependent.minor, true)
  assert.equal(dependent.email, null)
})
