'use client'
import { OperationalAgenda } from '@/components/agenda/operational-agenda'
import { useAuth } from '@/components/auth-provider'
import { LoadingState } from '@/components/ui/feedback'
import { ForbiddenState } from '@/components/ui/forbidden-state'
export default function AgendaPage() {
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
      operatorId={user.roles.includes('receptionist') ? user.id : undefined}
    />
  )
}
