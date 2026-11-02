export type AppRole =
  | 'patient'
  | 'receptionist'
  | 'professional'
  | 'manager'
  | 'admin'

export type NavigationDestination = {
  href: string
  label: string
  roles: readonly AppRole[]
}

// Include a destination in availableRoutes only after its page is implemented.
export const navigationDestinations: readonly NavigationDestination[] = [
  {
    href: '/minha-conta',
    label: 'Minha conta',
    roles: ['patient', 'receptionist', 'professional', 'manager', 'admin'],
  },
  {
    href: '/admin/usuarios',
    label: 'Usuários',
    roles: ['manager', 'admin'],
  },
  {
    href: '/recepcao/pacientes/novo',
    label: 'Cadastrar paciente',
    roles: ['receptionist', 'admin'],
  },
]

export function visibleDestinations(
  roles: readonly AppRole[],
  availableRoutes: ReadonlySet<string>,
): NavigationDestination[] {
  return navigationDestinations.filter(
    ({ href, roles: allowedRoles }) =>
      availableRoutes.has(href) &&
      roles.some((role) => allowedRoles.includes(role)),
  )
}

export function isCurrentDestination(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function destinationForPath(pathname: string) {
  if (/^\/recepcao\/pacientes\/[0-9a-f-]{36}\/consentimento$/i.test(pathname))
    return navigationDestinations.find(
      ({ href }) => href === '/recepcao/pacientes/novo',
    )
  return navigationDestinations.find(({ href }) =>
    isCurrentDestination(pathname, href),
  )
}
