'use client'

import { Building2, Layers, Plus, Stethoscope } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { CatalogForm } from '@/components/catalog/catalog-form'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { FieldError, Label, TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { selectClass } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { type AffectedAppointment, ApiError } from '@/services/api-client'
import {
  type CatalogInput,
  type CatalogKind,
  type CatalogPage,
  type CatalogRecord,
  catalog,
} from '@/services/catalog'

const sections = {
  specialties: {
    title: 'Especialidades',
    singular: 'especialidade',
    icon: Layers,
  },
  professionals: {
    title: 'Profissionais',
    singular: 'profissional',
    icon: Stethoscope,
  },
  rooms: { title: 'Salas', singular: 'sala', icon: Building2 },
}
const nameOf = (item: CatalogRecord) =>
  'displayName' in item ? item.displayName : item.name
const detailsOf = (item: CatalogRecord) =>
  'code' in item
    ? `${item.code} · Primeira: ${item.defaultMinutesFirst} min · Retorno: ${item.defaultMinutesReturn} min`
    : 'councilType' in item
      ? `${item.councilType} ${item.councilRegion} ${item.councilNumber} · ${item.specialtyIds.length} especialidade(s)`
      : '1 atendimento por vez'
const modalitiesOf = (item: CatalogRecord) =>
  ('allowedModalities' in item
    ? item.allowedModalities
    : 'modalities' in item
      ? item.modalities
      : []
  )
    .map((m) => (m === 'onsite' ? 'Presencial' : 'Online'))
    .join(' · ')
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
export default function CatalogPageView() {
  const { user } = useAuth()
  const permitted =
    user?.roles.some((r) => r === 'admin' || r === 'manager') ?? false
  const [kind, setKind] = useState<CatalogKind>('specialties')
  const [active, setActive] = useState('')
  const [cursor, setCursor] = useState('')
  const [previous, setPrevious] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<CatalogPage<CatalogRecord> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [editor, setEditor] = useState<{ initial?: CatalogRecord } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [success, setSuccess] = useState('')
  const [affected, setAffected] = useState<AffectedAppointment[]>([])
  const feedback = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload é o gatilho explícito para reler a mesma página após ação ou retry.
  useEffect(() => {
    if (!permitted) return
    let current = true
    setLoading(true)
    setLoadError(false)
    void catalog
      .list(kind, {
        active: active ? active === 'true' : undefined,
        cursor: cursor || undefined,
      })
      .then((result) => {
        if (current) setPage(result)
      })
      .catch((cause) => {
        if (current) {
          setLoadError(true)
          if (cause instanceof ApiError && cause.status === 403)
            setForbidden(true)
        }
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [permitted, kind, active, cursor, reload])
  useEffect(() => {
    if (error || affected.length) feedback.current?.focus()
  }, [error, affected])
  function reset() {
    setCursor('')
    setPrevious([])
    setSearch('')
    setEditor(null)
    setError('')
    setSuccess('')
    setAffected([])
  }
  function open(initial?: CatalogRecord) {
    setEditor({ initial })
    setError('')
    setSuccess('')
    setAffected([])
  }
  async function save(input: CatalogInput) {
    if (!editor) return false
    setBusy(true)
    setError('')
    setAffected([])
    setSuccess('')
    try {
      await catalog.save(kind, input, editor.initial)
      setEditor(null)
      setSuccess(
        'Cadastro salvo. As próximas marcações já usam a oferta atualizada.',
      )
      setReload((x) => x + 1)
      return true
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 403) setForbidden(true)
        setAffected(cause.affectedAppointments)
        setError(
          cause.code === 'CONFLICT'
            ? 'Não foi possível salvar: já existe um código, registro profissional ou nome de sala ativo, ou a versão foi alterada. Seus campos foram preservados. Confira os dados; se houve outra edição, feche o formulário e reabra a versão atual na lista.'
            : cause.message,
        )
      } else
        setError(
          'Não foi possível salvar. Confira sua conexão e tente novamente.',
        )
      throw cause
    } finally {
      setBusy(false)
    }
  }
  if (!user) return <LoadingState />
  if (!permitted || forbidden) return <ForbiddenState />
  const filtered =
    page?.items.filter((item) =>
      `${nameOf(item)} ${detailsOf(item)}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')),
    ) ?? []
  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Gestão da clínica
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Oferta de atendimento
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Organize especialidades, equipe e espaços para manter a agenda
            disponível.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => open()}>
          <Plus aria-hidden="true" className="size-4" />
          Adicionar {sections[kind].singular}
        </Button>
      </div>
      <nav
        aria-label="Seções do catálogo"
        className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2"
      >
        {(Object.keys(sections) as CatalogKind[]).map((key) => {
          const Icon = sections[key].icon
          return (
            <Button
              key={key}
              type="button"
              variant={kind === key ? 'secondary' : 'ghost'}
              aria-pressed={kind === key}
              disabled={busy}
              onClick={() => {
                reset()
                setKind(key)
              }}
            >
              <Icon aria-hidden="true" className="size-4" />
              {sections[key].title}
            </Button>
          )
        })}
      </nav>
      {success && <SuccessNotice title={success} />}
      <div ref={feedback} tabIndex={-1} className="space-y-3 outline-none">
        {error && <FieldError>{error}</FieldError>}
        {affected.length > 0 && (
          <section
            aria-labelledby="catalog-impact-title"
            className="space-y-3 rounded-2xl border border-status-warning-foreground/25 bg-status-warning-background p-5 text-sm text-status-warning-foreground"
          >
            <h2 id="catalog-impact-title" className="font-semibold">
              Consultas precisam ser resolvidas
            </h2>
            <p>
              A alteração não foi aplicada. Peça à recepção para reagendar ou
              cancelar cada consulta abaixo; depois, atualize a lista e tente
              novamente.
            </p>
            <p className="text-xs">Horários exibidos no fuso do navegador.</p>
            <ul className="space-y-3">
              {affected.map((item) => (
                <li key={item.id} className="break-words">
                  <strong className="block">
                    {formatDate(item.startsAt)} até {formatDate(item.endsAt)}
                  </strong>
                  <span className="text-xs">Consulta {item.id}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {editor && (
        <CatalogForm
          key={`${kind}:${editor.initial?.id ?? 'new'}:${editor.initial?.version ?? 0}`}
          kind={kind}
          initial={editor.initial}
          busy={busy}
          onSave={save}
          onClose={() => {
            setEditor(null)
            setError('')
            setAffected([])
          }}
        />
      )}
      <section
        aria-labelledby="catalog-list-title"
        className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-1) sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="catalog-list-title"
              className="font-heading text-xl font-semibold"
            >
              {sections[kind].title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastros inativos continuam disponíveis no histórico.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => setReload((x) => x + 1)}
          >
            Atualizar lista
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <TextField
            id="catalog-search"
            label="Buscar nesta página"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, código ou registro"
          />
          <div className="grid gap-2">
            <Label htmlFor="catalog-filter">Situação</Label>
            <select
              id="catalog-filter"
              className={selectClass}
              disabled={busy}
              value={active}
              onChange={(e) => {
                reset()
                setActive(e.target.value)
              }}
            >
              <option value="">Todas</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
        </div>
        {loadError ? (
          <ErrorState
            title="Não foi possível carregar o catálogo"
            nextStep="Confira sua conexão e tente novamente."
            onRetry={() => setReload((x) => x + 1)}
          />
        ) : loading || !page ? (
          <LoadingState
            label={`Carregando ${sections[kind].title.toLocaleLowerCase('pt-BR')}…`}
          />
        ) : !filtered.length ? (
          <EmptyState
            title="Nenhum cadastro nesta página"
            description={
              search
                ? 'Altere a busca ou avance para outra página.'
                : 'Altere o filtro ou adicione um cadastro para começar.'
            }
            action={
              <Button type="button" variant="outline" onClick={() => open()}>
                Adicionar {sections[kind].singular}
              </Button>
            }
          />
        ) : (
          <section
            aria-label={`Lista de ${sections[kind].title.toLocaleLowerCase('pt-BR')}`}
            className="max-w-full overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[660px] border-collapse text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Cadastro
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {kind === 'rooms' ? 'Capacidade' : 'Modalidades'}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Situação
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <strong className="block">{nameOf(item)}</strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {detailsOf(item)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {kind === 'rooms' ? '1 atendimento' : modalitiesOf(item)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        tone={item.active ? 'success' : 'neutral'}
                        label={item.active ? 'Ativo' : 'Inativo'}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Editar ${nameOf(item)}`}
                        onClick={() => open(item)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {page && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {filtered.length} cadastro(s) nesta página
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || loading || !previous.length}
                onClick={() => {
                  const stack = [...previous]
                  setCursor(stack.pop() ?? '')
                  setPrevious(stack)
                  setEditor(null)
                }}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || loading || !page.nextCursor}
                onClick={() => {
                  if (page.nextCursor) {
                    setPrevious((p) => [...p, cursor])
                    setCursor(page.nextCursor)
                    setEditor(null)
                  }
                }}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
