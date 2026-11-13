'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SuccessNotice } from '@/components/ui/feedback'
import { FieldError, FieldHelp, Label, TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { selectClass } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import {
  type BlockDraft,
  currentClinicDate,
  editSchedule,
  prepareSchedule,
  type RuleDraft,
  weekdayNames,
} from '@/lib/schedule-validation'
import { type AffectedAppointment, ApiError } from '@/services/api-client'
import {
  professionalSchedule,
  type ScheduleBlock,
  type ScheduleProfessional,
  type ScheduleSnapshot,
} from '@/services/schedule'

const blockNames: Record<ScheduleBlock['kind'], string> = {
  break: 'Intervalo',
  vacation: 'Férias',
  holiday: 'Feriado',
  emergency: 'Emergência',
}
export function ScheduleEditor({
  snapshot,
  profile,
  onDirty,
  onBusy,
}: {
  snapshot: ScheduleSnapshot
  profile: ScheduleProfessional | undefined
  onDirty: (value: boolean) => void
  onBusy: (value: boolean) => void
}) {
  const [initial] = useState(() => editSchedule(snapshot))
  const [rules, setRules] = useState<RuleDraft[]>(initial.rules),
    [blocks, setBlocks] = useState<BlockDraft[]>(initial.blocks)
  const [version, setVersion] = useState(snapshot.version),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(''),
    [published, setPublished] = useState(false),
    [forbidden, setForbidden] = useState(false)
  const [affected, setAffected] = useState<AffectedAppointment[]>(
      snapshot.affectedAppointments,
    ),
    [impactBlocked, setImpactBlocked] = useState(false)
  const feedback = useRef<HTMLDivElement>(null)
  const timeZone = snapshot.clinicTimeZone
  useEffect(() => {
    if (message || Object.keys(errors).length) feedback.current?.focus()
  }, [message, errors])
  function changed() {
    setDirty(true)
    onDirty(true)
    setPublished(false)
    setMessage('')
    setErrors({})
  }
  function editRule(key: string, input: Partial<RuleDraft>) {
    setRules((values) =>
      values.map((r) => (r.key === key ? { ...r, ...input } : r)),
    )
    changed()
  }
  function editBlock(key: string, input: Partial<BlockDraft>) {
    setBlocks((values) =>
      values.map((b) => (b.key === key ? { ...b, ...input } : b)),
    )
    changed()
  }
  function addRule(weekday: number) {
    setRules((values) => [
      ...values,
      {
        key: crypto.randomUUID(),
        weekday,
        localStart: '',
        localEnd: '',
        effectiveFrom: currentClinicDate(timeZone),
        effectiveTo: null,
        modality: profile?.modalities[0] ?? 'onsite',
      },
    ])
    changed()
  }
  function addBlock() {
    setBlocks((values) => [
      ...values,
      {
        key: crypto.randomUUID(),
        startLocal: '',
        endLocal: '',
        kind: 'break',
        reason: '',
      },
    ])
    changed()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPublished(false)
    setMessage('')
    setErrors({})
    const prepared = prepareSchedule(rules, blocks, timeZone)
    if (!prepared.data) {
      setErrors(prepared.errors)
      setMessage('Revise os campos indicados antes de publicar.')
      return
    }
    setBusy(true)
    onBusy(true)
    try {
      const result = await professionalSchedule.publish(
        snapshot.professionalId,
        { expectedVersion: version, ...prepared.data },
      )
      setVersion(result.version)
      setDirty(false)
      onDirty(false)
      setPublished(true)
      setAffected(result.affectedAppointments)
      setImpactBlocked(false)
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 403 || cause.status === 404) setForbidden(true)
        setAffected(cause.affectedAppointments)
        setImpactBlocked(cause.code === 'SCHEDULE_IMPACT_REVIEW')
        setErrors(
          Object.fromEntries(cause.details.map((d) => [d.field, d.reason])),
        )
        setMessage(
          cause.code === 'CONFLICT'
            ? 'Outra pessoa publicou uma versão mais recente. Seu rascunho foi preservado. Recarregue a grade e revise as alterações antes de publicar novamente.'
            : cause.message,
        )
      } else
        setMessage(
          'Não foi possível publicar. Confira a conexão e tente novamente. Seu rascunho foi preservado.',
        )
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  const format = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value))
  if (forbidden) return <ForbiddenState />
  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="min-w-0 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            {profile?.displayName ?? 'Profissional selecionado'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Versão publicada {version} · Horários da clínica: {timeZone}
          </p>
        </div>
        <StatusBadge
          tone={dirty ? 'warning' : 'neutral'}
          label={
            dirty ? 'Alterações não publicadas' : 'Sem alterações pendentes'
          }
        />
      </div>
      <div ref={feedback} tabIndex={-1} className="space-y-2 outline-none">
        {message && <FieldError>{message}</FieldError>}
        {errors.rules && <FieldError>{errors.rules}</FieldError>}
        {errors.blocks && <FieldError>{errors.blocks}</FieldError>}
      </div>
      {published && (
        <SuccessNotice
          title="Grade publicada"
          description={
            affected.length
              ? 'As consultas afetadas foram preservadas. Confira as pendências abaixo e acompanhe a comunicação com os envolvidos.'
              : 'A disponibilidade já considera a nova configuração.'
          }
        />
      )}
      {affected.length > 0 && (
        <section
          aria-labelledby="schedule-impact"
          className="space-y-3 rounded-2xl border border-status-warning-foreground/25 bg-status-warning-background p-5 text-sm text-status-warning-foreground"
        >
          <h3 id="schedule-impact" className="font-semibold">
            {impactBlocked
              ? 'Alteração não publicada: consultas afetadas'
              : 'Pendências na grade publicada'}
          </h3>
          <p>
            {impactBlocked
              ? 'Resolva o reagendamento ou cancelamento com a recepção antes de tentar publicar.'
              : 'As consultas continuam reservadas e precisam de acompanhamento pela recepção.'}
          </p>
          <ul className="space-y-2">
            {affected.map((a) => (
              <li key={a.id} className="break-words">
                <strong className="block">
                  {format(a.startsAt)} até {format(a.endsAt)}
                </strong>
                <span className="text-xs">Consulta {a.id}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <legend className="sr-only">Editor de grade e bloqueios</legend>
        <section aria-labelledby="weekly-title" className="space-y-4">
          <div>
            <h3
              id="weekly-title"
              className="font-heading text-xl font-semibold"
            >
              Faixas da semana
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Adicione faixas separadas para representar intervalos. Todas as
              vigências são mantidas ao publicar.
            </p>
          </div>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {weekdayNames.map((name, day) => {
              const items = rules.flatMap((r, index) =>
                r.weekday === day + 1 ? [{ r, index }] : [],
              )
              return (
                <section
                  key={name}
                  aria-label={name}
                  className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-1)"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold">{name}</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rules.length >= 200}
                      onClick={() => addRule(day + 1)}
                      aria-label={`Adicionar faixa de ${name}`}
                    >
                      Adicionar faixa
                    </Button>
                  </div>
                  {!items.length && (
                    <p className="py-3 text-sm text-muted-foreground">
                      Sem faixa de atendimento.
                    </p>
                  )}
                  {items.map(({ r, index }, position) => (
                    <fieldset
                      key={r.key}
                      aria-label={`Faixa ${position + 1} de ${name}`}
                      className="grid min-w-0 gap-3 rounded-xl border border-border p-3 sm:grid-cols-2"
                    >
                      <legend className="px-1 text-xs font-semibold text-muted-foreground">
                        Faixa {position + 1}
                      </legend>
                      <TextField
                        id={`start-${r.key}`}
                        type="time"
                        label="Início"
                        value={r.localStart}
                        onChange={(e) =>
                          editRule(r.key, { localStart: e.target.value })
                        }
                        error={errors[`rules.${index}.localStart`]}
                      />
                      <TextField
                        id={`end-${r.key}`}
                        label="Término"
                        inputMode="numeric"
                        placeholder="HH:mm"
                        help="Use 24:00 para encerrar à meia-noite."
                        value={r.localEnd}
                        onChange={(e) =>
                          editRule(r.key, { localEnd: e.target.value })
                        }
                        error={errors[`rules.${index}.localEnd`]}
                      />
                      <TextField
                        id={`from-${r.key}`}
                        type="date"
                        label="Vigência a partir de"
                        value={r.effectiveFrom}
                        onChange={(e) =>
                          editRule(r.key, { effectiveFrom: e.target.value })
                        }
                        error={errors[`rules.${index}.effectiveFrom`]}
                      />
                      <TextField
                        id={`to-${r.key}`}
                        type="date"
                        label="Vigência até (opcional)"
                        value={r.effectiveTo ?? ''}
                        onChange={(e) =>
                          editRule(r.key, {
                            effectiveTo: e.target.value || null,
                          })
                        }
                        error={errors[`rules.${index}.effectiveTo`]}
                      />
                      <div className="grid gap-2">
                        <Label htmlFor={`mode-${r.key}`}>Modalidade</Label>
                        <select
                          id={`mode-${r.key}`}
                          className={selectClass}
                          value={r.modality}
                          onChange={(e) =>
                            editRule(r.key, {
                              modality: e.target.value as RuleDraft['modality'],
                            })
                          }
                        >
                          {!(profile?.modalities ?? []).includes(
                            r.modality,
                          ) && (
                            <option value={r.modality} disabled>
                              {r.modality === 'onsite'
                                ? 'Presencial'
                                : 'Online'}{' '}
                              (não habilitada)
                            </option>
                          )}
                          {(profile?.modalities ?? ['onsite', 'remote']).map(
                            (m) => (
                              <option key={m} value={m}>
                                {m === 'onsite' ? 'Presencial' : 'Online'}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setRules((values) =>
                              values.filter((value) => value.key !== r.key),
                            )
                            changed()
                          }}
                          aria-label={`Remover faixa ${position + 1} de ${name}`}
                        >
                          Remover faixa
                        </Button>
                      </div>
                    </fieldset>
                  ))}
                </section>
              )
            })}
          </div>
        </section>
        <section
          aria-labelledby="blocks-title"
          className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-1) sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                id="blocks-title"
                className="font-heading text-xl font-semibold"
              >
                Intervalos, férias e bloqueios
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Datas e horários no fuso {timeZone}; nenhum feriado é importado
                automaticamente.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={blocks.length >= 500}
              onClick={addBlock}
            >
              Adicionar bloqueio
            </Button>
          </div>
          {!blocks.length && (
            <p className="py-3 text-sm text-muted-foreground">
              Nenhum bloqueio nesta versão.
            </p>
          )}
          {blocks.map((b, index) => (
            <fieldset
              key={b.key}
              aria-label={`Bloqueio ${index + 1}`}
              className="grid min-w-0 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2"
            >
              <legend className="px-1 text-sm font-semibold">
                Bloqueio {index + 1}
              </legend>
              <div className="grid gap-2">
                <Label htmlFor={`kind-${b.key}`}>Tipo de bloqueio</Label>
                <select
                  id={`kind-${b.key}`}
                  className={selectClass}
                  value={b.kind}
                  onChange={(e) =>
                    editBlock(b.key, {
                      kind: e.target.value as BlockDraft['kind'],
                    })
                  }
                >
                  {Object.entries(blockNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setBlocks((values) =>
                      values.filter((value) => value.key !== b.key),
                    )
                    changed()
                  }}
                  aria-label={`Remover bloqueio ${index + 1}`}
                >
                  Remover bloqueio
                </Button>
              </div>
              <TextField
                id={`block-start-${b.key}`}
                type="datetime-local"
                step="0.001"
                label="Início do bloqueio"
                value={b.startLocal}
                onChange={(e) =>
                  editBlock(b.key, { startLocal: e.target.value })
                }
                error={errors[`blocks.${index}.startLocal`]}
              />
              <TextField
                id={`block-end-${b.key}`}
                type="datetime-local"
                step="0.001"
                label="Término do bloqueio"
                value={b.endLocal}
                onChange={(e) => editBlock(b.key, { endLocal: e.target.value })}
                error={errors[`blocks.${index}.endLocal`]}
              />
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`reason-${b.key}`}>Motivo do bloqueio</Label>
                <Textarea
                  id={`reason-${b.key}`}
                  value={b.reason}
                  onChange={(e) => editBlock(b.key, { reason: e.target.value })}
                  maxLength={1000}
                  aria-invalid={!!errors[`blocks.${index}.reason`]}
                  aria-describedby={`reason-error-${b.key}`}
                />
                <FieldError id={`reason-error-${b.key}`}>
                  {errors[`blocks.${index}.reason`]}
                </FieldError>
              </div>
              {b.kind === 'emergency' && (
                <p className="text-sm leading-6 text-status-warning-foreground sm:col-span-2">
                  Emergência preserva as consultas existentes e aciona a
                  comunicação com os envolvidos. A recepção precisa acompanhar a
                  resolução de cada atendimento.
                </p>
              )}
            </fieldset>
          ))}
        </section>
        <section
          aria-labelledby="schedule-preview"
          className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-5"
        >
          <h3 id="schedule-preview" className="font-semibold">
            Prévia da configuração
          </h3>
          <p className="text-sm">
            {rules.length} faixa(s) semanal(is) · {blocks.length} bloqueio(s) ·
            versão atual {version}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            A publicação considera a grade inteira. Sobreposições, permissões e
            impacto nas consultas serão verificados pelo sistema antes de
            aplicar a mudança.
          </p>
        </section>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'Publicando…' : 'Publicar grade'}
          </Button>
          <FieldHelp>Consultas não são apagadas ao alterar a grade.</FieldHelp>
        </div>
      </fieldset>
    </form>
  )
}
