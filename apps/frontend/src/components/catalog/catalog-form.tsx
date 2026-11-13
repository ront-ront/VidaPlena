'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { FieldError, FieldHelp, Label, TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { adminUsers, type InternalUser } from '@/services/admin-users'
import { ApiError } from '@/services/api-client'
import {
  type CatalogInput,
  type CatalogKind,
  type CatalogRecord,
  catalog,
  type Modality,
  type Specialty,
} from '@/services/catalog'

const regions = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const
const common = {
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome.')
    .max(255, 'Use até 255 caracteres.'),
  active: z.boolean(),
}
const modalitiesSchema = z
  .array(z.enum(['onsite', 'remote']))
  .min(1, 'Escolha ao menos uma modalidade.')
const specialtySchema = z.object({
  ...common,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9_-]{1,50}$/,
      'Use letras, números, hífen ou sublinhado, até 50 caracteres.',
    ),
  allowedModalities: modalitiesSchema,
  defaultMinutesFirst: z.coerce
    .number()
    .int('Use minutos inteiros.')
    .positive('Informe uma duração maior que zero.'),
  defaultMinutesReturn: z.coerce
    .number()
    .int('Use minutos inteiros.')
    .positive('Informe uma duração maior que zero.'),
})
const professionalSchema = z.object({
  userId: z.uuid('Selecione uma conta profissional.'),
  councilType: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,12}$/, 'Informe o conselho, como CRM ou CRP.'),
  councilRegion: z.enum(regions, { error: 'Selecione uma UF válida.' }),
  councilNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,30}$/, 'Use até 30 letras e números.'),
  specialtyIds: z
    .array(z.uuid())
    .min(1, 'Selecione ao menos uma especialidade.'),
  modalities: modalitiesSchema,
  active: z.boolean(),
})
const roomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da sala.')
    .max(255, 'Use até 255 caracteres.'),
  active: z.boolean(),
})

export function CatalogForm({
  kind,
  initial,
  busy,
  onSave,
  onClose,
}: {
  kind: CatalogKind
  initial?: CatalogRecord
  busy: boolean
  onSave: (input: CatalogInput) => Promise<boolean>
  onClose: () => void
}) {
  const specialty = initial && 'code' in initial ? initial : undefined
  const professional = initial && 'userId' in initial ? initial : undefined
  const [draft, setDraft] = useState({
    name: initial && 'name' in initial ? initial.name : '',
    code: specialty?.code ?? '',
    first: String(specialty?.defaultMinutesFirst ?? ''),
    return: String(specialty?.defaultMinutesReturn ?? ''),
    userId: professional?.userId ?? '',
    councilType: professional?.councilType ?? '',
    councilNumber: professional?.councilNumber ?? '',
    councilRegion: professional?.councilRegion ?? '',
    active: initial?.active ?? true,
  })
  const [modalities, setModalities] = useState<Modality[]>(
    specialty?.allowedModalities ?? professional?.modalities ?? ['onsite'],
  )
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(
    professional?.specialtyIds ?? [],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmation, setConfirmation] = useState<CatalogInput | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [accounts, setAccounts] = useState<InternalUser[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [accountCursor, setAccountCursor] = useState<string | null>(null)
  const [specialtyCursor, setSpecialtyCursor] = useState<string | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(kind === 'professionals')
  const [optionsError, setOptionsError] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload permite repetir a busca de opções após falha sem alterar o formulário.
  useEffect(() => {
    if (kind !== 'professionals') return
    let active = true
    setOptionsLoading(true)
    setOptionsError(false)
    void Promise.all([
      adminUsers.list({ role: 'professional' }),
      catalog.list('specialties'),
    ])
      .then(([users, items]) => {
        if (!active) return
        setAccounts(users.items)
        setAccountCursor(users.nextCursor)
        setSpecialties(items.items)
        setSpecialtyCursor(items.nextCursor)
      })
      .catch(() => {
        if (active) setOptionsError(true)
      })
      .finally(() => {
        if (active) setOptionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [kind, reload])
  function field(key: keyof typeof draft, value: string | boolean) {
    setDraft((d) => ({ ...d, [key]: value }))
    const errorKey =
      key === 'first'
        ? 'defaultMinutesFirst'
        : key === 'return'
          ? 'defaultMinutesReturn'
          : key
    setErrors((e) => ({ ...e, [errorKey]: '' }))
    setConfirmation(null)
  }
  async function moreOptions(type: 'accounts' | 'specialties') {
    setOptionsLoading(true)
    setOptionsError(false)
    try {
      if (type === 'accounts' && accountCursor) {
        const page = await adminUsers.list({
          role: 'professional',
          cursor: accountCursor,
        })
        setAccounts((current) => [
          ...new Map(
            [...current, ...page.items].map((x) => [x.id, x]),
          ).values(),
        ])
        setAccountCursor(page.nextCursor)
      }
      if (type === 'specialties' && specialtyCursor) {
        const page = await catalog.list('specialties', {
          cursor: specialtyCursor,
        })
        setSpecialties((current) => [
          ...new Map(
            [...current, ...page.items].map((x) => [x.id, x]),
          ).values(),
        ])
        setSpecialtyCursor(page.nextCursor)
      }
    } catch {
      setOptionsError(true)
    } finally {
      setOptionsLoading(false)
    }
  }
  async function save(input: CatalogInput) {
    try {
      return await onSave(input)
    } catch (cause) {
      if (cause instanceof ApiError)
        setErrors(
          Object.fromEntries(cause.details.map((d) => [d.field, d.reason])),
        )
      return false
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConfirmation(null)
    const parsed =
      kind === 'specialties'
        ? specialtySchema.safeParse({
            name: draft.name,
            code: draft.code,
            active: draft.active,
            allowedModalities: modalities,
            defaultMinutesFirst: draft.first,
            defaultMinutesReturn: draft.return,
          })
        : kind === 'professionals'
          ? professionalSchema.safeParse({
              userId: draft.userId,
              councilType: draft.councilType,
              councilNumber: draft.councilNumber,
              councilRegion: draft.councilRegion,
              active: draft.active,
              specialtyIds,
              modalities,
            })
          : roomSchema.safeParse({ name: draft.name, active: draft.active })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      )
      return
    }
    setErrors({})
    if (initial?.active && !parsed.data.active) {
      setConfirmation(parsed.data)
      return
    }
    await save(parsed.data)
  }
  const title = initial ? 'Editar cadastro' : 'Novo cadastro'
  return (
    <section
      aria-labelledby="catalog-form-title"
      className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-6"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            id="catalog-form-title"
            className="font-heading text-xl font-semibold outline-none"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {kind === 'rooms'
              ? 'Cada sala comporta um atendimento por vez.'
              : kind === 'professionals'
                ? 'Vincule a conta e configure sua oferta de atendimento.'
                : 'Defina modalidades e duração para os próximos agendamentos.'}
          </p>
        </div>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Fechar
        </Button>
      </div>
      {optionsError && (
        <ErrorState
          title="Não foi possível carregar as opções"
          nextStep="Tente novamente para escolher a conta e as especialidades."
          onRetry={() => setReload((x) => x + 1)}
        />
      )}
      {optionsLoading && (
        <LoadingState label="Carregando opções do cadastro…" />
      )}
      <form onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
          <legend className="sr-only">Dados do cadastro</legend>
          {kind !== 'professionals' && (
            <TextField
              id="catalog-name"
              label="Nome"
              value={draft.name}
              onChange={(e) => field('name', e.target.value)}
              error={errors.name}
              maxLength={255}
            />
          )}
          {kind === 'specialties' && (
            <>
              <TextField
                id="catalog-code"
                label="Código da especialidade"
                value={draft.code}
                onChange={(e) => field('code', e.target.value)}
                error={errors.code}
                help="Identificador único, como CARDIO."
                maxLength={50}
              />
              <TextField
                id="catalog-first"
                type="number"
                min={1}
                step={1}
                label="Primeira consulta (minutos)"
                value={draft.first}
                onChange={(e) => field('first', e.target.value)}
                error={errors.defaultMinutesFirst}
              />
              <TextField
                id="catalog-return"
                type="number"
                min={1}
                step={1}
                label="Retorno (minutos)"
                value={draft.return}
                onChange={(e) => field('return', e.target.value)}
                error={errors.defaultMinutesReturn}
              />
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Consultas já confirmadas mantêm sua duração original.
              </p>
            </>
          )}
          {kind === 'professionals' && (
            <>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="catalog-account">Conta profissional</Label>
                <select
                  id="catalog-account"
                  className={selectClass}
                  value={draft.userId}
                  disabled={!!initial || optionsLoading || optionsError}
                  aria-invalid={!!errors.userId}
                  aria-describedby="catalog-account-help catalog-account-error"
                  onChange={(e) => field('userId', e.target.value)}
                >
                  <option value="">Selecione a conta</option>
                  {professional &&
                    !accounts.some((a) => a.id === professional.userId) && (
                      <option value={professional.userId}>
                        {professional.displayName}
                      </option>
                    )}
                  {accounts
                    .filter(
                      (a) =>
                        ['active', 'invited'].includes(a.status) ||
                        a.id === draft.userId,
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fullName}
                        {a.status === 'invited' ? ' · convite pendente' : ''}
                      </option>
                    ))}
                </select>
                <FieldHelp id="catalog-account-help">
                  {initial
                    ? 'A conta vinculada é preservada.'
                    : 'Use uma conta com papel profissional, criada em Usuários.'}
                </FieldHelp>
                <FieldError id="catalog-account-error">
                  {errors.userId}
                </FieldError>
                {accountCursor && (
                  <Button
                    variant="outline"
                    type="button"
                    disabled={optionsLoading}
                    onClick={() => void moreOptions('accounts')}
                  >
                    Carregar mais contas
                  </Button>
                )}
              </div>
              <TextField
                id="catalog-council"
                label="Conselho"
                value={draft.councilType}
                onChange={(e) => field('councilType', e.target.value)}
                error={errors.councilType}
                placeholder="CRM, CRP…"
              />
              <TextField
                id="catalog-number"
                label="Número do registro"
                value={draft.councilNumber}
                onChange={(e) => field('councilNumber', e.target.value)}
                error={errors.councilNumber}
                maxLength={30}
              />
              <div className="grid gap-2">
                <Label htmlFor="catalog-region">UF do conselho</Label>
                <select
                  id="catalog-region"
                  className={selectClass}
                  value={draft.councilRegion}
                  aria-invalid={!!errors.councilRegion}
                  aria-describedby="catalog-region-error"
                  onChange={(e) => field('councilRegion', e.target.value)}
                >
                  <option value="">Selecione a UF</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <FieldError id="catalog-region-error">
                  {errors.councilRegion}
                </FieldError>
              </div>
              <fieldset
                className="space-y-3 rounded-xl border border-border p-4 sm:col-span-2"
                aria-describedby="catalog-specialties-error"
              >
                <legend className="px-1 text-sm font-semibold">
                  Especialidades
                </legend>
                {specialties.map((s) => (
                  <label
                    key={s.id}
                    className="flex min-h-9 items-center gap-3 text-sm"
                  >
                    <input
                      className="size-5 shrink-0 accent-primary"
                      type="checkbox"
                      checked={specialtyIds.includes(s.id)}
                      disabled={!s.active && !specialtyIds.includes(s.id)}
                      onChange={(e) => {
                        setSpecialtyIds((ids) =>
                          e.target.checked
                            ? [...ids, s.id]
                            : ids.filter((id) => id !== s.id),
                        )
                        setConfirmation(null)
                      }}
                    />
                    {s.name}
                    {!s.active ? ' (inativa)' : ''}
                  </label>
                ))}
                {specialtyIds.filter(
                  (id) => !specialties.some((s) => s.id === id),
                ).length > 0 && (
                  <FieldHelp>
                    Há especialidades vinculadas em outras páginas. Carregue as
                    próximas opções para revisá-las; os vínculos são
                    preservados.
                  </FieldHelp>
                )}
                {!optionsLoading && !specialties.length && (
                  <FieldHelp>
                    Cadastre uma especialidade antes de vincular o profissional.
                  </FieldHelp>
                )}
                <FieldError id="catalog-specialties-error">
                  {errors.specialtyIds}
                </FieldError>
                {specialtyCursor && (
                  <Button
                    variant="outline"
                    type="button"
                    disabled={optionsLoading}
                    onClick={() => void moreOptions('specialties')}
                  >
                    Carregar mais especialidades
                  </Button>
                )}
              </fieldset>
            </>
          )}
          {kind !== 'rooms' && (
            <fieldset
              className="space-y-3 rounded-xl border border-border p-4 sm:col-span-2"
              aria-describedby="catalog-modalities-error"
            >
              <legend className="px-1 text-sm font-semibold">
                Modalidades de atendimento
              </legend>
              <div className="flex flex-wrap gap-5">
                {(['onsite', 'remote'] as Modality[]).map((m) => (
                  <label
                    key={m}
                    className="flex min-h-9 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={modalities.includes(m)}
                      onChange={(e) => {
                        setModalities((current) =>
                          e.target.checked
                            ? [...current, m]
                            : current.filter((v) => v !== m),
                        )
                        setConfirmation(null)
                      }}
                    />
                    {m === 'onsite' ? 'Presencial' : 'Online'}
                  </label>
                ))}
              </div>
              <FieldError id="catalog-modalities-error">
                {errors.modalities ?? errors.allowedModalities}
              </FieldError>
            </fieldset>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium sm:col-span-2">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={draft.active}
              onChange={(e) => field('active', e.target.checked)}
            />
            Cadastro ativo
          </label>
          {confirmation ? (
            <section
              aria-label="Confirmar inativação"
              className="space-y-4 rounded-xl border border-status-warning-foreground/25 bg-status-warning-background p-4 text-sm text-status-warning-foreground sm:col-span-2"
            >
              <p className="font-semibold">Revisar e inativar este cadastro?</p>
              <p>
                Se houver consultas futuras afetadas, a alteração será recusada.
                Resolva os agendamentos antes de tentar novamente. O histórico
                será preservado.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void save(confirmation)}
                >
                  Revisar e inativar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                >
                  Voltar à edição
                </Button>
              </div>
            </section>
          ) : (
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  (kind === 'professionals' && (optionsLoading || optionsError))
                }
              >
                {busy ? 'Salvando…' : 'Salvar cadastro'}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={onClose}
              >
                Cancelar
              </Button>
            </div>
          )}
        </fieldset>
      </form>
    </section>
  )
}
