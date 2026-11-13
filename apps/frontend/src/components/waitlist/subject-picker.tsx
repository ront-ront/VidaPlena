'use client'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { selectClass } from '@/components/ui/select'
import { ApiError } from '@/services/api-client'
export type WaitingSubject = { patientId: string; fullName: string }
export function SubjectPicker({
  subjects,
  value,
  onChange,
  lookup,
  disabled = false,
}: {
  subjects?: WaitingSubject[]
  value: WaitingSubject | null
  onChange: (value: WaitingSubject | null) => void
  lookup?: (cpf: string) => Promise<WaitingSubject>
  disabled?: boolean
}) {
  const id = useId(),
    [cpf, setCpf] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function find() {
    if (!lookup || busy) return
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) {
      setError('Informe CPF completo com 11 dígitos.')
      return
    }
    setBusy(true)
    setError('')
    onChange(null)
    try {
      onChange(await lookup(digits))
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível localizar o paciente.',
      )
    } finally {
      setBusy(false)
    }
  }
  return subjects ? (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        Paciente
      </label>
      <select
        id={id}
        className={selectClass}
        disabled={disabled}
        value={value?.patientId ?? ''}
        onChange={(e) =>
          onChange(subjects.find((s) => s.patientId === e.target.value) ?? null)
        }
      >
        <option value="">Selecione a pessoa da sua conta</option>
        {subjects.map((s) => (
          <option key={s.patientId} value={s.patientId}>
            {s.fullName}
          </option>
        ))}
      </select>
    </div>
  ) : (
    <div className="space-y-3">
      <TextField
        id={id}
        label="CPF do paciente"
        value={cpf}
        maxLength={14}
        disabled={disabled || busy}
        error={error}
        onChange={(e) => {
          setCpf(e.target.value)
          onChange(null)
          setError('')
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy}
        onClick={find}
      >
        {busy ? 'Localizando…' : 'Localizar paciente'}
      </Button>
      {value && (
        <p role="status" className="text-sm font-semibold">
          Paciente: {value.fullName}
        </p>
      )}
    </div>
  )
}
