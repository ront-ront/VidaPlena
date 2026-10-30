import { z } from 'zod'
import {
  civilDate,
  isUnderCivilAge,
  normalizeCpf,
  normalizeMobile,
} from '../../domain/rules/patient-identity'
import { ApplicationError } from '../errors/application-error'
import type {
  PatientRegistrationStore,
  PreparedPatient,
} from '../ports/patient-registration'

const inputSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  birthDate: z.iso.date(),
  cpf: z.string().min(11).max(18),
  phone: z.string().min(10).max(20).optional(),
  email: z.email().max(255).optional(),
})

export class PreparePatientRegistration {
  constructor(
    private readonly store: PatientRegistrationStore,
    private readonly legalAdultAgeYears: number,
    private readonly now = () => new Date(),
  ) {}

  prepare(
    input: unknown,
    mode: 'self' | 'dependent' | 'onsite',
  ): PreparedPatient {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        [
          ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
        ].map((field) => ({ field, reason: 'Revise o valor deste campo.' })),
      )
    const data = parsed.data
    const birthDate = civilDate(data.birthDate)
    const cpf = normalizeCpf(data.cpf)
    const phone = data.phone ? normalizeMobile(data.phone) : null
    const today = this.now()
    if (!birthDate || birthDate > today)
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'birthDate',
          reason: 'Informe uma data de nascimento válida.',
        },
      ])
    if (!cpf)
      throw new ApplicationError('VALIDATION_ERROR', [
        { field: 'cpf', reason: 'Informe um CPF válido.' },
      ])
    if (data.phone && !phone)
      throw new ApplicationError('VALIDATION_ERROR', [
        { field: 'phone', reason: 'Informe um celular válido.' },
      ])
    const minor = isUnderCivilAge(birthDate, today, this.legalAdultAgeYears)
    if (mode === 'self' && minor)
      throw new ApplicationError('VALIDATION_ERROR', [
        { field: 'birthDate', reason: 'O cadastro requer responsável legal.' },
      ])
    if (
      (mode === 'self' && (!phone || !data.email)) ||
      (mode === 'onsite' && !phone)
    )
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: !phone ? 'phone' : 'email',
          reason: 'Informe os dados de contato obrigatórios.',
        },
      ])
    return {
      fullName: data.fullName,
      birthDate,
      cpf,
      phone,
      email: data.email?.trim().toLowerCase() ?? null,
      minor,
    }
  }

  async dependents(userId: string) {
    return { items: await this.store.dependents(userId) }
  }

  isMinor(birthDate: Date) {
    return isUnderCivilAge(birthDate, this.now(), this.legalAdultAgeYears)
  }
}
