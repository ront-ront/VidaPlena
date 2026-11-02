import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <SearchX aria-hidden="true" className="size-6" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Página não encontrada
      </p>
      <h1 className="text-2xl font-semibold">Não encontramos esta página</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Confira o endereço ou volte ao início para continuar.
      </p>
      <Button render={<Link href="/" />} variant="secondary">
        Voltar ao início
      </Button>
    </main>
  )
}
