'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useAuth } from '@/components/auth-provider'
import { ScheduleEditor } from '@/components/schedule/schedule-editor'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'
import { Label } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { selectClass } from '@/components/ui/select'
import { ApiError } from '@/services/api-client'
import {
  professionalSchedule,
  type ScheduleProfessional,
  type ScheduleSnapshot,
} from '@/services/schedule'
export default function SchedulePage() {
  const { user } = useAuth()
  const userId = user?.id
  const allowed = user?.roles.some((r) => r !== 'patient') ?? false
  const manageOthers =
    user?.roles.some((r) => ['admin', 'manager', 'receptionist'].includes(r)) ??
    false
  const [profiles, setProfiles] = useState<ScheduleProfessional[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(true),
    [optionsError, setOptionsError] = useState(false),
    [reloadOptions, setReloadOptions] = useState(0)
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(false),
    [forbidden, setForbidden] = useState(false)
  const [revision, setRevision] = useState(0),
    [dirty, setDirty] = useState(false),
    [publishing, setPublishing] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadOptions é o retry explícito da seleção quando a leitura falha.
  useEffect(() => {
    if (!allowed || !userId) return
    let active = true
    setOptionsLoading(true)
    setOptionsError(false)
    void (
      manageOthers
        ? professionalSchedule.professionals()
        : professionalSchedule
            .ownProfile()
            .then((p) => ({ items: [p], nextCursor: null }))
    )
      .then((page) => {
        if (!active) return
        setProfiles(page.items)
        setCursor(page.nextCursor)
        const requested = new URLSearchParams(window.location.search).get(
          'professionalId',
        )
        if (requested && !z.uuid().safeParse(requested).success) {
          setLoadError(true)
          return
        }
        setSelected(
          requested ?? (!manageOthers ? (page.items[0]?.id ?? '') : ''),
        )
      })
      .catch((cause) => {
        if (active) {
          if (cause instanceof ApiError && [403, 404].includes(cause.status))
            setForbidden(true)
          else setOptionsError(true)
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [allowed, manageOthers, userId, reloadOptions])
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision dispara releitura completa por decisão explícita de descartar o rascunho.
  useEffect(() => {
    if (!allowed || !userId || !selected) return
    let active = true
    setLoading(true)
    setLoadError(false)
    setDirty(false)
    void professionalSchedule
      .read(selected)
      .then((data) => {
        if (active) setSnapshot(data)
      })
      .catch((cause) => {
        if (active) {
          if (cause instanceof ApiError && [403, 404].includes(cause.status))
            setForbidden(true)
          else setLoadError(true)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [allowed, selected, userId, revision])
  async function more() {
    if (!cursor) return
    setOptionsLoading(true)
    setOptionsError(false)
    try {
      const page = await professionalSchedule.professionals(cursor)
      setProfiles((current) => [
        ...new Map([...current, ...page.items].map((p) => [p.id, p])).values(),
      ])
      setCursor(page.nextCursor)
    } catch {
      setOptionsError(true)
    } finally {
      setOptionsLoading(false)
    }
  }
  if (!user) return <LoadingState />
  if (!allowed || forbidden) return <ForbiddenState />
  const profile = profiles.find((p) => p.id === selected)
  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Organização da agenda
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Grade de atendimento
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Organize os dias da semana, intervalos e períodos de
          indisponibilidade. A publicação preserva o histórico da agenda.
        </p>
      </header>
      {optionsError ? (
        <ErrorState
          title="Não foi possível carregar os profissionais"
          nextStep="Confira sua conexão e tente novamente."
          onRetry={() => setReloadOptions((x) => x + 1)}
        />
      ) : null}
      {optionsLoading && profiles.length === 0 ? (
        <LoadingState label="Carregando profissionais…" />
      ) : (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-2">
            <Label htmlFor="schedule-professional">Profissional</Label>
            <select
              id="schedule-professional"
              className={selectClass}
              value={selected}
              disabled={!manageOthers || dirty || publishing || optionsLoading}
              onChange={(e) => {
                setSelected(e.target.value)
                setSnapshot(null)
                setRevision(0)
              }}
            >
              <option value="">Selecione o profissional</option>
              {selected && !profile && (
                <option value={selected}>Profissional indicado no link</option>
              )}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          {dirty && (
            <p className="text-sm text-status-warning-foreground">
              Publique ou descarte as alterações antes de trocar o profissional.
            </p>
          )}
          {cursor && manageOthers && (
            <Button
              type="button"
              variant="outline"
              disabled={optionsLoading || publishing}
              onClick={() => void more()}
            >
              Carregar mais profissionais
            </Button>
          )}
          {selected && (
            <Button
              type="button"
              variant="outline"
              disabled={loading || publishing}
              onClick={() => setRevision((x) => x + 1)}
            >
              {dirty ? 'Recarregar e descartar alterações' : 'Recarregar grade'}
            </Button>
          )}
        </section>
      )}
      {loading ? (
        <LoadingState label="Carregando a grade completa…" />
      ) : loadError ? (
        <ErrorState
          title="Não foi possível carregar a grade"
          nextStep="Confira o profissional indicado e sua conexão, depois tente novamente."
          onRetry={() =>
            selected
              ? setRevision((x) => x + 1)
              : setReloadOptions((x) => x + 1)
          }
        />
      ) : snapshot ? (
        <ScheduleEditor
          key={`${selected}:${revision}`}
          snapshot={snapshot}
          profile={profile}
          onDirty={setDirty}
          onBusy={setPublishing}
        />
      ) : !optionsLoading && !optionsError ? (
        <EmptyState
          title={
            profiles.length
              ? 'Selecione um profissional'
              : 'Nenhum profissional disponível'
          }
          description={
            profiles.length
              ? 'Escolha a pessoa para consultar e editar sua grade.'
              : 'A clínica precisa cadastrar um perfil profissional ativo antes de publicar horários.'
          }
        />
      ) : null}
    </div>
  )
}
