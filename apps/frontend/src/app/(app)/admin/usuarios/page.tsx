'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { FieldError, FieldHelp, TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import {
  adminUsers,
  type InternalRole,
  type InternalUser,
  type UserPage,
} from '@/services/admin-users'
import { ApiError } from '@/services/api-client'

const roleNames: Record<InternalRole, string> = {
  receptionist: 'Recepção',
  professional: 'Profissional',
  manager: 'Gestor',
  admin: 'Administrador',
}
const statusNames: Record<InternalUser['status'], string> = {
  invited: 'Convite pendente',
  active: 'Ativa',
  inactive: 'Inativa',
  locked: 'Bloqueada',
}
const statusTones: Record<InternalUser['status'], StatusTone> = {
  invited: 'info',
  active: 'success',
  inactive: 'neutral',
  locked: 'warning',
}
const inviteSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo.'),
  email: z.email('Informe um e-mail válido.'),
  role: z.enum(['receptionist', 'professional', 'manager']),
})
const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

export default function UsersPage() {
  const { user } = useAuth()
  const admin = user?.roles.includes('admin') ?? false
  const manager = user?.roles.includes('manager') ?? false
  const [page, setPage] = useState<UserPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [roleFilter, setRoleFilter] = useState<InternalRole | ''>('')
  const [statusFilter, setStatusFilter] = useState<InternalUser['status'] | ''>(
    '',
  )
  const [cursor, setCursor] = useState('')
  const [previous, setPrevious] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<
    'receptionist' | 'professional' | 'manager'
  >('receptionist')
  const [inviteErrors, setInviteErrors] = useState<{
    fullName?: string
    email?: string
    role?: string
  }>({})
  const [selectedId, setSelectedId] = useState('')
  const [editedRoles, setEditedRoles] = useState<InternalRole[]>([])
  const [confirmStatus, setConfirmStatus] = useState<
    'active' | 'inactive' | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!admin && !manager) return
    setLoading(true)
    setLoadError(false)
    try {
      setPage(
        await adminUsers.list({
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          cursor: cursor || undefined,
        }),
      )
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [admin, manager, roleFilter, statusFilter, cursor])

  useEffect(() => {
    void load()
  }, [load])
  const selected = page?.items.find((item) => item.id === selectedId)
  const filtered =
    page?.items.filter((item) =>
      `${item.fullName} ${item.email}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')),
    ) ?? []

  function resetFilters() {
    setCursor('')
    setPrevious([])
    setSelectedId('')
  }
  function choose(item: InternalUser) {
    setSelectedId(item.id)
    setEditedRoles(item.roles)
    setConfirmStatus(null)
    setError('')
    setSuccess('')
  }

  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await action()
      setSuccess(message)
      setConfirmStatus(null)
      await load()
      return true
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'Não foi possível concluir: conta existente, convite incompatível ou último administrador ativo. Confira os dados e tente novamente.'
          : cause instanceof ApiError
            ? cause.message
            : 'Não foi possível concluir a ação.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = inviteSchema.safeParse({
      fullName: inviteName,
      email: inviteEmail,
      role: inviteRole,
    })
    if (!result.success) {
      setInviteErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      )
      return
    }
    if (!admin && result.data.role === 'manager') {
      setInviteErrors({ role: 'Somente administradores convidam gestores.' })
      return
    }
    const invited = await perform(
      () => adminUsers.invite(result.data),
      'Convite enviado. A pessoa receberá um link para definir a senha.',
    )
    if (!invited) return
    setInviteOpen(false)
    setInviteName('')
    setInviteEmail('')
    setInviteErrors({})
  }

  if (!user) return <LoadingState />
  if (!admin && !manager) return <ForbiddenState />

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Administração
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Usuários internos
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Convide a equipe e acompanhe papéis, acesso e revisão de contas.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setInviteOpen((value) => !value)
            setError('')
            setSuccess('')
          }}
        >
          {inviteOpen ? 'Fechar convite' : 'Convidar usuário'}
        </Button>
      </div>

      {page && !page.dpoDesignated && (
        <div
          role="alert"
          className="rounded-xl border border-status-warning-foreground/20 bg-status-warning-background p-4 text-sm text-status-warning-foreground"
        >
          <strong>Nenhum encarregado de dados designado.</strong> As
          solicitações de titulares ficam sob responsabilidade do administrador
          até a designação formal.
        </div>
      )}
      {admin && page?.dpoHolders.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Encarregado de dados</CardTitle>
            <CardDescription>
              Pessoas com a permissão privacy.dpo ativa. A designação formal
              pela clínica ainda deve ser confirmada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {page.dpoHolders.map((holder) => (
                <li key={holder.id} className="font-semibold">
                  {holder.fullName}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {success && <SuccessNotice title={success} />}
      {error && <FieldError>{error}</FieldError>}

      {inviteOpen && (
        <Card>
          <CardHeader>
            <CardTitle>Enviar convite</CardTitle>
            <CardDescription>
              A conta fica pendente até a pessoa definir uma senha pelo link
              enviado por e-mail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void invite(event)}
              className="grid gap-4 sm:grid-cols-2"
            >
              <TextField
                id="invite-name"
                label="Nome completo"
                value={inviteName}
                onChange={(event) => {
                  setInviteName(event.target.value)
                  setInviteErrors((current) => ({
                    ...current,
                    fullName: undefined,
                  }))
                }}
                error={inviteErrors.fullName}
                autoComplete="name"
              />
              <TextField
                id="invite-email"
                label="E-mail"
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value)
                  setInviteErrors((current) => ({
                    ...current,
                    email: undefined,
                  }))
                }}
                error={inviteErrors.email}
                autoComplete="email"
              />
              <div className="grid gap-2">
                <label htmlFor="invite-role" className="text-sm font-semibold">
                  Papel
                </label>
                <select
                  id="invite-role"
                  className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as typeof inviteRole)
                  }
                >
                  {(
                    [
                      'receptionist',
                      'professional',
                      ...(admin ? ['manager'] : []),
                    ] as InternalRole[]
                  ).map((role) => (
                    <option key={role} value={role}>
                      {roleNames[role]}
                    </option>
                  ))}
                </select>
                {inviteErrors.role && (
                  <FieldError>{inviteErrors.role}</FieldError>
                )}
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  Enviar convite
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contas da equipe</CardTitle>
          <CardDescription>
            Contas inativas permanecem no histórico. Nenhuma conta é excluída
            por esta tela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              id="search-users"
              label="Buscar nesta página"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome ou e-mail"
            />
            <div className="grid gap-2">
              <label htmlFor="role-filter" className="text-sm font-semibold">
                Papel
              </label>
              <select
                id="role-filter"
                className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value as InternalRole | '')
                  resetFilters()
                }}
              >
                <option value="">Todos</option>
                {(
                  [
                    'receptionist',
                    'professional',
                    ...(admin ? ['manager', 'admin'] : []),
                  ] as InternalRole[]
                ).map((role) => (
                  <option key={role} value={role}>
                    {roleNames[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="status-filter" className="text-sm font-semibold">
                Situação
              </label>
              <select
                id="status-filter"
                className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(
                    event.target.value as InternalUser['status'] | '',
                  )
                  resetFilters()
                }}
              >
                <option value="">Todas</option>
                {(Object.keys(statusNames) as InternalUser['status'][]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {statusNames[status]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
          {loadError ? (
            <ErrorState
              title="Não foi possível listar usuários"
              nextStep="Confira sua conexão e tente novamente."
              onRetry={() => void load()}
            />
          ) : loading || !page ? (
            <LoadingState label="Carregando usuários…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nenhum usuário nesta página"
              description={
                search
                  ? 'Limpe a busca local ou avance para outra página.'
                  : 'Altere os filtros ou convide uma pessoa da equipe.'
              }
            />
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-border">
              <table className="min-w-[700px] w-full border-collapse text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Pessoa
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Papéis
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Situação
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Último acesso
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <strong className="block">{item.fullName}</strong>
                        <span className="text-xs text-muted-foreground">
                          {item.email}
                        </span>
                        {item.permissions.includes('privacy.dpo') && (
                          <span className="ml-2 text-xs font-semibold text-primary">
                            DPO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.roles
                          .map((role) => roleNames[role] ?? role)
                          .join(', ')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          tone={statusTones[item.status]}
                          label={statusNames[item.status]}
                        />
                        {item.reviewRequiredAt && (
                          <span className="mt-1 block text-xs text-status-warning-foreground">
                            Revisão de acesso necessária
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.lastLoginAt ? date(item.lastLoginAt) : 'Nunca'}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => choose(item)}
                        >
                          {admin ? 'Gerenciar' : 'Ver detalhes'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {page && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {filtered.length} conta(s) nesta página
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || previous.length === 0}
                  onClick={() => {
                    const copy = [...previous]
                    setCursor(copy.pop() ?? '')
                    setPrevious(copy)
                  }}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || !page.nextCursor}
                  onClick={() => {
                    if (page.nextCursor) {
                      setPrevious((current) => [...current, cursor])
                      setCursor(page.nextCursor)
                    }
                  }}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.fullName}</CardTitle>
            <CardDescription>
              Conta {statusNames[selected.status].toLocaleLowerCase('pt-BR')} ·{' '}
              {selected.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selected.status === 'invited' && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Convite pendente ou expirado?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => adminUsers.resend(selected.id),
                      'Novo convite enviado. O link anterior foi invalidado.',
                    )
                  }
                >
                  Reenviar convite
                </Button>
              </div>
            )}
            {selected.status === 'locked' && (
              <FieldHelp>
                Conta temporariamente bloqueada. Revise os eventos de acesso
                antes de tomar outra medida.
              </FieldHelp>
            )}
            {admin ? (
              <>
                <div className="space-y-3">
                  <h3 className="font-semibold">Papéis</h3>
                  <div className="flex flex-wrap gap-4">
                    {(Object.keys(roleNames) as InternalRole[]).map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-5 accent-primary"
                          checked={editedRoles.includes(role)}
                          onChange={(event) =>
                            setEditedRoles((current) =>
                              event.target.checked
                                ? [...current, role]
                                : current.filter((value) => value !== role),
                            )
                          }
                        />
                        {roleNames[role]}
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      busy ||
                      editedRoles.length === 0 ||
                      selected.status === 'inactive'
                    }
                    onClick={() =>
                      void perform(
                        () => adminUsers.roles(selected.id, editedRoles),
                        'Papéis atualizados e sessões anteriores encerradas.',
                      )
                    }
                  >
                    Salvar papéis
                  </Button>
                  <FieldHelp>
                    Alterar seus próprios papéis pode encerrar esta sessão. O
                    último administrador ativo é protegido.
                  </FieldHelp>
                </div>
                <div className="border-t border-border pt-4">
                  <h3 className="mb-3 font-semibold">
                    Permissão do encarregado de dados
                  </h3>
                  {selected.roles.some(
                    (role) => role === 'admin' || role === 'manager',
                  ) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || selected.status !== 'active'}
                      onClick={() =>
                        void perform(
                          () =>
                            adminUsers.dpo(
                              selected.id,
                              !selected.permissions.includes('privacy.dpo'),
                            ),
                          selected.permissions.includes('privacy.dpo')
                            ? 'Permissão DPO retirada e auditada.'
                            : 'Permissão DPO atribuída e auditada.',
                        )
                      }
                    >
                      {selected.permissions.includes('privacy.dpo')
                        ? 'Retirar DPO'
                        : 'Designar DPO'}
                    </Button>
                  ) : (
                    <FieldHelp>
                      Somente admin ou gestor pode receber esta permissão.
                    </FieldHelp>
                  )}
                </div>
                <div className="border-t border-border pt-4">
                  <h3 className="mb-3 font-semibold">Situação da conta</h3>
                  {selected.status === 'active' && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmStatus('inactive')}
                    >
                      Inativar conta
                    </Button>
                  )}
                  {selected.status === 'inactive' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmStatus('active')}
                    >
                      Reativar conta
                    </Button>
                  )}
                  {confirmStatus && (
                    <div
                      role="alertdialog"
                      aria-modal="false"
                      aria-labelledby="status-confirm-title"
                      className="mt-4 space-y-3 rounded-xl border border-border p-4"
                    >
                      <h4 id="status-confirm-title" className="font-semibold">
                        Confirmar{' '}
                        {confirmStatus === 'inactive'
                          ? 'inativação'
                          : 'reativação'}
                        ?
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {confirmStatus === 'inactive'
                          ? 'As sessões ativas serão encerradas. O registro e a auditoria serão preservados.'
                          : 'A conta voltará a permitir acesso com as credenciais vigentes.'}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              () =>
                                adminUsers.status(selected.id, confirmStatus),
                              confirmStatus === 'inactive'
                                ? 'Conta inativada. Sessões encerradas.'
                                : 'Conta reativada.',
                            )
                          }
                        >
                          Confirmar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setConfirmStatus(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <FieldHelp>
                Gestores podem listar e convidar recepção/profissionais.
                Alterações de papéis, status e DPO são feitas por um
                administrador.
              </FieldHelp>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
