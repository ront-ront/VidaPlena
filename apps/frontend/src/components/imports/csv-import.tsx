'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { z } from 'zod'
import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import {
  ErrorState,
  LoadingState,
  SuccessNotice,
} from '@/components/ui/feedback'
import { TextField } from '@/components/ui/field'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { commandNonce } from '@/lib/booking-command'
import { ApiError } from '@/services/api-client'
import {
  type ImportKind,
  type ImportReport,
  importError,
  imports,
  sourceSystemSchema,
} from '@/services/imports'

const statuses = {
  preview: 'Prévia pronta',
  invalid: 'Arquivo inválido',
  processing: 'Processamento em andamento',
  confirmed: 'Relatório final',
}
const rowStatuses = {
  accepted: 'Apta',
  rejected: 'Recusada',
  imported: 'Importada',
  existing: 'Já existente',
}
export function CsvImport({ kind }: { kind: ImportKind }) {
  const appointments = kind === 'appointments'
  const { user } = useAuth()
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [lookup, setLookup] = useState('')
  const [reportAction, setReportAction] = useState<
    'preview' | 'confirm' | 'read'
  >('preview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [notice, setNotice] = useState('')
  const [blockedBatch, setBlockedBatch] = useState<string | null>(null)
  const gate = useRef(false)
  function invalidate() {
    setReport(null)
    setAcknowledged(false)
    setError('')
    setNotice('')
  }
  async function run(action: 'preview' | 'confirm' | 'read') {
    if (!user || gate.current) return
    if (
      action === 'preview' &&
      (!sourceSystemSchema.safeParse(source).success ||
        !file?.name.toLowerCase().endsWith('.csv'))
    ) {
      setError(
        'Informe uma origem de até 64 caracteres (letras, números, ponto, dois-pontos, hífen ou sublinhado) e selecione um CSV.',
      )
      return
    }
    if (action === 'read' && !z.uuid().safeParse(lookup.trim()).success) {
      setError('Informe um identificador de lote válido.')
      return
    }
    if (
      action === 'confirm' &&
      (!report ||
        blockedBatch === report.batchId ||
        !acknowledged ||
        !['preview', 'processing', 'confirmed'].includes(report.status))
    )
      return
    gate.current = true
    setBusy(true)
    setError('')
    setNotice('')
    if (action === 'preview') {
      setReport(null)
      setAcknowledged(false)
    }
    try {
      let result: ImportReport
      if (action === 'preview' && file)
        result = await imports.preview(kind, source.trim(), file)
      else if (action === 'confirm' && report) {
        const nonce = await commandNonce([
          user.id,
          `imports.${kind}.confirm`,
          report.batchId,
          report.fileHash,
        ])
        result = await imports.confirm(report, nonce.key)
        if (!nonce.persisted)
          setNotice(
            'A chave desta tentativa está somente na memória. Após recarregar, consulte o lote antes de confirmar novamente.',
          )
      } else
        result = await imports.read(
          kind,
          (action === 'read' ? lookup : (report?.batchId ?? '')).trim(),
        )
      setReport(result)
      setReportAction(action)
      setLookup(result.batchId)
      setAcknowledged(false)
    } catch (cause) {
      if (action === 'read') setReport(null)
      if (
        action === 'confirm' &&
        report &&
        cause instanceof ApiError &&
        cause.status === 409
      )
        setBlockedBatch(report.batchId)
      setError(
        cause instanceof ApiError && cause.status === 413
          ? 'Arquivo acima do limite configurado. Reduza o CSV e tente novamente.'
          : cause instanceof ApiError && cause.status > 0 && cause.status < 500
            ? `${cause.message} Confira o lote ou gere uma nova prévia.`
            : action === 'confirm'
              ? 'Não foi possível confirmar o resultado. Consulte o lote antes de repetir; a mesma chave será reutilizada.'
              : 'Não foi possível analisar ou consultar o arquivo. Tente novamente.',
      )
    } finally {
      gate.current = false
      setBusy(false)
    }
  }
  if (!user) return <LoadingState />
  if (!user.roles.some((role) => role === 'admin' || role === 'manager'))
    return <ForbiddenState />
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h2 className="font-heading text-3xl font-semibold">
          Importar {appointments ? 'agenda' : 'pacientes'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Demonstração com dados fictícios. A prévia não cria{' '}
          {appointments ? 'consultas' : 'pacientes'}; a confirmação não cria
          contas, consentimentos ou notificações.
          {appointments &&
            ' A agenda também não agenda lembretes. Revise as referências e os intervalos antes de confirmar.'}
        </p>
      </header>
      {error && (
        <ErrorState
          title="Não foi possível concluir a operação"
          nextStep={error}
        />
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void run('preview')
        }}
      >
        <TextField
          id="import-source"
          label="Sistema de origem"
          value={source}
          disabled={busy}
          onChange={(event) => {
            setSource(event.target.value)
            invalidate()
          }}
        />
        <p className="text-sm">
          CSV em UTF-8, separador ponto e vírgula, datas YYYY-MM-DD. A origem de
          cada linha deve coincidir com o campo acima.
        </p>
        <p className="break-all rounded-lg bg-muted p-3 font-mono text-xs">
          {appointments
            ? 'external_id;patient_cpf;professional_external_id;specialty_code;room_name;starts_at;ends_at;modality;visit_type;status;source_system'
            : 'external_id;full_name;birth_date;cpf;email;phone;source_system'}
        </p>
        {appointments && (
          <p className="text-sm text-muted-foreground">
            Use o UUID do profissional cadastrado e código da especialidade
            existente. Presencial: nome da sala obrigatório; remoto: sala vazia.
            Início/fim em ISO8601 com fuso; modalidade onsite/remote, tipo
            first/return e status confirmed/cancelled/completed.
          </p>
        )}
        <label htmlFor="import-file" className="block text-sm font-semibold">
          Arquivo CSV de {appointments ? 'agenda' : 'pacientes'}
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className="block w-full min-w-0 text-sm"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            invalidate()
          }}
        />
        <Button type="submit" disabled={busy || !file}>
          {busy ? 'Processando…' : 'Analisar arquivo'}
        </Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void run('read')
        }}
      >
        <TextField
          id="import-lookup"
          label="Identificador de lote anterior"
          value={lookup}
          disabled={busy}
          onChange={(event) => setLookup(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !lookup.trim()}
        >
          Consultar lote
        </Button>
      </form>
      {busy && <LoadingState label="Analisando ou consultando o lote…" />}
      {report && (
        <section
          className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5"
          aria-label="Relatório de importação"
        >
          <h3 className="font-heading text-xl font-semibold">
            {statuses[report.status]}
            {appointments && report.clinicTimeZone && (
              <span className="block text-xs font-normal text-muted-foreground">
                Horários da clínica: {report.clinicTimeZone}
              </span>
            )}
          </h3>
          <p className="break-all text-xs text-muted-foreground">
            Lote {report.batchId} · origem {report.sourceSystem} · importador{' '}
            {report.createdBy} · criado em{' '}
            {new Date(report.createdAt).toLocaleString('pt-BR')}
          </p>
          <p className="text-sm">
            Aptas: {report.accepted} · Recusadas: {report.rejected} · Importadas{' '}
            {reportAction === 'confirm' ? 'nesta resposta' : 'no lote'}:{' '}
            {report.imported} · Existentes: {report.existing}
          </p>
          {report.replayed && (
            <SuccessNotice
              title="Lote já confirmado"
              description="Repetição sem novas gravações. O relatório mantém o histórico das linhas."
            />
          )}
          {report.status === 'confirmed' && !report.replayed && (
            <SuccessNotice
              title="Importação concluída"
              description="Confira as linhas importadas e recusadas abaixo. Nenhuma conta ou mensagem foi criada."
            />
          )}
          {report.fileErrors.length > 0 && (
            <ul
              aria-label="Erros do arquivo"
              className="space-y-1 text-sm text-destructive"
            >
              {report.fileErrors.map((code) => (
                <li key={code}>{importError(code)}</li>
              ))}
            </ul>
          )}
          {report.status === 'processing' && (
            <p role="status" className="text-sm">
              Há processamento parcial. Consulte as linhas já importadas e
              confirme para retomar somente as pendentes; elas não serão
              duplicadas.
            </p>
          )}
          <section
            className="max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Linhas do lote"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável precisa foco de teclado.
            tabIndex={0}
          >
            <table
              className={`w-full text-left text-sm ${appointments ? 'min-w-[1100px]' : 'min-w-[680px]'}`}
            >
              <caption className="sr-only">
                Resultado por linha do arquivo
              </caption>
              <thead>
                <tr>
                  {[
                    'Linha',
                    'Identificador',
                    ...(appointments
                      ? [
                          'CPF mascarado',
                          'Profissional (UUID)',
                          'Especialidade',
                          'Sala',
                          'Horário',
                          'Consulta',
                          'Agenda do dia',
                        ]
                      : ['Paciente', 'CPF mascarado']),
                    'Situação',
                    'Motivos',
                  ].map((value) => (
                    <th key={value} scope="col" className="p-2">
                      {value}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.line} className="border-t border-border">
                    <td className="p-2">{row.line}</td>
                    <td className="p-2">{row.externalId ?? '—'}</td>
                    {appointments ? (
                      <>
                        <td className="p-2">{row.cpfMasked ?? '—'}</td>
                        <td className="min-w-40 max-w-48 break-all p-2">
                          {row.professionalExternalId ?? '—'}
                        </td>
                        <td className="p-2">{row.specialtyCode ?? '—'}</td>
                        <td className="p-2">
                          {row.modality === 'remote'
                            ? 'Online · sem sala'
                            : (row.roomName ?? '—')}
                        </td>
                        <td className="min-w-48 p-2">
                          {row.startsAt && row.endsAt
                            ? `${new Date(row.startsAt).toLocaleString('pt-BR', { timeZone: report.clinicTimeZone })} até ${new Date(row.endsAt).toLocaleTimeString('pt-BR', { timeZone: report.clinicTimeZone, hour: '2-digit', minute: '2-digit' })}`
                            : '—'}
                        </td>
                        <td className="p-2">
                          {row.appointmentStatus
                            ? {
                                confirmed: 'Confirmada',
                                cancelled: 'Cancelada',
                                completed: 'Finalizada',
                              }[row.appointmentStatus]
                            : '—'}
                        </td>
                        <td className="min-w-32 p-2">
                          {row.localDate && (
                            <Link
                              className="font-semibold text-primary underline"
                              href={`/agenda?date=${row.localDate}`}
                            >
                              Ver agenda de {row.localDate}
                            </Link>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2">{row.fullName ?? '—'}</td>
                        <td className="p-2">{row.cpfMasked ?? '—'}</td>
                      </>
                    )}
                    <td className="p-2">
                      {rowStatuses[row.status]}
                      {row.targetId &&
                        ['existing', 'imported'].includes(row.status) && (
                          <span className="mt-1 block max-w-48 break-all text-xs text-muted-foreground">
                            Registro: {row.targetId}
                          </span>
                        )}
                    </td>
                    <td className="min-w-48 p-2">
                      {row.errors.map(importError).join(' ')}
                      {row.duplicateOf && ' Referência duplicada detectada.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {report.status !== 'invalid' && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={busy}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                Conferi o relatório e autorizo a confirmação ou repetição deste
                lote.
              </label>
              <Button
                type="button"
                disabled={
                  busy || !acknowledged || blockedBatch === report.batchId
                }
                onClick={() => void run('confirm')}
              >
                Confirmar lote
              </Button>
              <p className="text-xs text-muted-foreground">
                A confirmação revalida dados e conflitos. Lotes expirados são
                recusados pelo servidor; consulte o relatório antes de repetir
                uma tentativa sem resposta.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  )
}
