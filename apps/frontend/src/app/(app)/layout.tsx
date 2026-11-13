'use client'

import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/components/auth-provider'
import { ForbiddenState } from '@/components/ui/forbidden-state'
import { destinationForPath } from '@/lib/navigation'

const availableRoutes = new Set<string>([
  '/agendar',
  '/agenda',
  '/agenda/espera',
  '/minhas-consultas',
  '/agenda/grade',
  '/gestao/catalogo',
  '/minha-conta',
  '/admin/usuarios',
  '/admin/termos',
  '/recepcao/pacientes/novo',
])

// FE-004 supplies the authenticated viewer and implemented routes.
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'anonymous')
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [status, pathname, router])

  if (status !== 'authenticated' || !user)
    return (
      <AppShell availableRoutes={availableRoutes} viewer={null}>
        {children}
      </AppShell>
    )

  const destination = destinationForPath(pathname)
  if (
    destination &&
    !user.roles.some((role) => destination.roles.includes(role))
  )
    return <ForbiddenState />

  return (
    <AppShell
      availableRoutes={availableRoutes}
      viewer={{ name: user.profile.fullName, roles: user.roles }}
    >
      {children}
    </AppShell>
  )
}
