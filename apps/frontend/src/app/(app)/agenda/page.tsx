'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { z } from 'zod'
import { OperationalAgenda } from '@/components/agenda/operational-agenda'
import { useAuth } from '@/components/auth-provider'
import { LoadingState } from '@/components/ui/feedback'
import { ForbiddenState } from '@/components/ui/forbidden-state'

function AgendaContent() {
  const params = useSearchParams()
  const date = z.iso.date().safeParse(params.get('date'))
  const initialDate = date.success ? date.data : undefined
  const { user } = useAuth()
  if (!user) return <LoadingState />
  if (
    !user.roles.some((role) =>
      ['receptionist', 'manager', 'admin'].includes(role),
    )
  )
    return <ForbiddenState />
  return (
    <OperationalAgenda
      key={initialDate ?? 'current'}
      initialDate={initialDate}
      canCorrectAbsence={user.roles.includes('manager')}
      operatorId={user.roles.includes('receptionist') ? user.id : undefined}
    />
  )
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AgendaContent />
    </Suspense>
  )
}
