import { LockKeyhole } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function ForbiddenState() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <LockKeyhole aria-hidden="true" className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold">Acesso não disponível</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Você não tem acesso a esta página. Volte para sua área ou fale com a
        equipe responsável se precisar de ajuda.
      </p>
      <Button render={<Link href="/" />} variant="secondary">
        Voltar ao início
      </Button>
    </div>
  )
}
