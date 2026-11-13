import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback'

export function ConsentTermState({
  state,
  admin = false,
  onRetry,
}: {
  state: 'loading' | 'missing' | 'error'
  admin?: boolean
  onRetry: () => void
}) {
  if (state === 'loading')
    return <LoadingState label="Carregando o termo vigente…" />
  if (state === 'error')
    return (
      <ErrorState
        title="Não foi possível carregar o termo"
        nextStep="Confira a conexão e tente novamente. O cadastro continua bloqueado até que o termo seja carregado."
        onRetry={onRetry}
      />
    )
  return (
    <EmptyState
      title="Nenhum termo vigente publicado"
      description={
        admin
          ? 'Publique o termo em outra aba e depois retorne aqui para atualizar. Os dados preenchidos serão mantidos.'
          : 'A clínica precisa disponibilizar o termo de tratamento de dados para concluir o cadastro. Solicite a publicação ao administrador e tente novamente.'
      }
      action={
        <div className="flex flex-wrap justify-center gap-3">
          {admin && (
            <Link
              href="/admin/termos"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants()}
            >
              Publicar termo em outra aba
            </Link>
          )}
          <Button type="button" variant="outline" onClick={onRetry}>
            Atualizar termo
          </Button>
        </div>
      }
    />
  )
}
