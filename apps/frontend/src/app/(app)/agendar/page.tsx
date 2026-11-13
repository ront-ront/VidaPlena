'use client'

import { useState } from 'react'
import { AppointmentSearch } from '@/components/appointments/appointment-search'
import { BookingReview } from '@/components/appointments/booking-review'
import { useAuth } from '@/components/auth-provider'
import { LoadingState } from '@/components/ui/feedback'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import type { BookingSelection } from '@/services/availability'
export default function BookingPage() {
  const { user } = useAuth(),
    [selection, setSelection] = useState<BookingSelection | null>(null),
    [busy, setBusy] = useState(false)
  if (!user) return <LoadingState />
  if (!user.roles.includes('patient')) return <ForbiddenState />
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Seu próximo cuidado
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Agendar atendimento
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Encontre o horário que funciona para você. A escolha é revisada antes
          da confirmação.
        </p>
        <ol
          aria-label="Etapas do agendamento"
          className="flex flex-wrap gap-3 text-sm"
        >
          <li
            aria-current={!selection ? 'step' : undefined}
            className={
              !selection
                ? 'font-semibold text-primary'
                : 'text-muted-foreground'
            }
          >
            1. Escolher horário
          </li>
          <li
            aria-current={selection ? 'step' : undefined}
            className={
              selection ? 'font-semibold text-primary' : 'text-muted-foreground'
            }
          >
            2. Revisar e confirmar
          </li>
        </ol>
      </header>
      {selection && (
        <BookingReview
          user={user}
          selection={selection}
          onSelect={setSelection}
          onBack={() => setSelection(null)}
          onBusy={setBusy}
        />
      )}
      <div inert={busy || undefined} aria-busy={busy}>
        <AppointmentSearch selection={selection} onSelect={setSelection} />
      </div>
    </div>
  )
}
