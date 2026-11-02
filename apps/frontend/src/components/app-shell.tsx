'use client'

import { Dialog } from '@base-ui/react/dialog'
import { ArrowUpRight, Menu, UserRound, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { LoadingState } from '@/components/ui/feedback'
import {
  type AppRole,
  isCurrentDestination,
  type NavigationDestination,
  visibleDestinations,
} from '@/lib/navigation'
import { cn } from '@/lib/utils'

export type ShellViewer = {
  name: string
  roles: readonly AppRole[]
}

type AppShellProps = {
  children: ReactNode
  viewer: ShellViewer | null
  availableRoutes: ReadonlySet<string>
  title?: string
  primaryAction?: ReactNode
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Image src="/logo.png" alt="" width={38} height={38} />
      <span className="font-heading text-lg font-bold tracking-tight">
        <span className="text-vida-blue">Vida</span>
        <span className="text-vida-mint">Plena</span>
      </span>
    </div>
  )
}

function NavigationLinks({
  destinations,
  pathname,
  onNavigate,
}: {
  destinations: readonly NavigationDestination[]
  pathname: string
  onNavigate?: () => void
}) {
  if (destinations.length === 0) {
    return (
      <p className="px-3 py-4 text-sm leading-6 text-muted-foreground">
        Suas páginas estarão disponíveis aqui.
      </p>
    )
  }

  return (
    <nav aria-label="Navegação principal" className="space-y-1">
      {destinations.map((destination) => {
        const active = isCurrentDestination(pathname, destination.href)
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              active && 'bg-secondary font-bold text-secondary-foreground',
            )}
            href={destination.href}
            key={destination.href}
            onClick={onNavigate}
          >
            <span>{destination.label}</span>
            <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        )
      })}
    </nav>
  )
}

export function AppShell({
  children,
  viewer,
  availableRoutes,
  title,
  primaryAction,
}: AppShellProps) {
  const pathname = usePathname()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  if (!viewer) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center justify-center px-4">
        <LoadingState label="Carregando sua área…" />
      </main>
    )
  }

  const destinations = visibleDestinations(viewer.roles, availableRoutes)
  const currentDestination = destinations.find((destination) =>
    isCurrentDestination(pathname, destination.href),
  )
  const pageTitle = title ?? currentDestination?.label ?? 'Sua área'

  return (
    <div className="min-h-dvh min-w-0 bg-background text-foreground min-[761px]:grid min-[761px]:grid-cols-[280px_minmax(0,1fr)] min-[761px]:max-[1050px]:grid-cols-[220px_minmax(0,1fr)]">
      <a
        className="sr-only absolute z-50 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:left-4 focus:top-4"
        href="#conteudo-principal"
      >
        Ir para o conteúdo principal
      </a>

      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-border bg-card px-[18px] py-6 min-[761px]:block">
        <div className="mb-10 px-2">
          <Brand />
        </div>
        <NavigationLinks destinations={destinations} pathname={pathname} />
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-24 min-w-0 items-end justify-between gap-4 border-b border-border bg-card px-4 pb-5 pt-14 sm:px-6 min-[761px]:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog.Root
              open={mobileNavigationOpen}
              onOpenChange={setMobileNavigationOpen}
            >
              <Dialog.Trigger
                aria-label="Abrir navegação"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[761px]:hidden"
              >
                <Menu aria-hidden="true" className="size-5" />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/35 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-safe:transition-opacity" />
                <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-border bg-card p-5 shadow-(--shadow-3) focus:outline-none data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full motion-safe:transition-transform">
                  <div className="mb-8 flex items-center justify-between gap-3">
                    <Dialog.Title className="text-base">Navegação</Dialog.Title>
                    <Dialog.Close
                      aria-label="Fechar navegação"
                      className="flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X aria-hidden="true" className="size-5" />
                    </Dialog.Close>
                  </div>
                  <Brand />
                  <div className="mt-7">
                    <NavigationLinks
                      destinations={destinations}
                      pathname={pathname}
                      onNavigate={() => setMobileNavigationOpen(false)}
                    />
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Área de cuidado
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {primaryAction}
            <div className="hidden max-w-52 items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground min-[900px]:flex">
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">Usuário: {viewer.name}</span>
            </div>
          </div>
        </header>

        <main
          className="mx-auto min-h-[calc(100dvh-6rem)] w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6 min-[761px]:px-8"
          id="conteudo-principal"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
