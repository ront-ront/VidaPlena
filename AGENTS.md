# Instruções do repositório VidaPlena

## Ordem de leitura obrigatória

1. `specs/00-constitution.md` primeiro.
2. `specs/01-overview.md`, `specs/03-implementation-order.md` e `specs/02-traceability-matrix.md`.
3. A spec BE ou FE escolhida; em seguida, apenas as seções compartilhadas que ela indica em “Contexto necessário”.
4. Para frontend, ler também `apps/frontend/AGENTS.md`, `specs/frontend/design-system.md` e `specs/frontend/screens-map.md`. Antes de escrever código Next.js, consultar a documentação da versão instalada em `apps/frontend/node_modules/next/dist/docs/`.

**Implemente somente uma spec por vez e nunca fora do escopo dela.** Não trate arquivos de referência compartilhados como autorização para implementar outras specs. Respeite dependências e registre divergências nas perguntas/matriz antes de alterar contratos.

## Stack e arquitetura

- Monorepo Yarn 1 workspaces e Turbo.
- Backend: TypeScript, Express 5, PostgreSQL 17, Prisma 7, Redis 7; Clean Architecture descrita em `specs/backend/architecture.md`.
- Frontend: Next.js 16 App Router, React 19, Tailwind CSS 4, Shadcn/Base UI e Lucide.
- API REST/JSON e sinalização WebSocket conforme `specs/shared/api-contracts.md`.
- Contratos, modelo de dados, regras de negócio, acesso e parâmetros têm fonte única em `specs/shared/`; não os redefina em BE/FE.

## Comandos existentes

| Ação | Comando no diretório raiz |
| --- | --- |
| Desenvolvimento conjunto | `yarn dev` |
| Desenvolvimento backend | `yarn dev:backend` |
| Desenvolvimento frontend | `yarn dev:frontend` |
| Build frontend | `yarn workspace vida-plena-frontend build` |
| Lint do monorepo | `yarn lint` |
| Lint por aplicação | `yarn workspace vida-plena-backend lint` ou `yarn workspace vida-plena-frontend lint` |

O backend e a raiz não possuem script de build ou test no estado examinado em 23/10/2026; a spec responsável por criá-los deve documentar o comando antes de usá-lo. **NUNCA rode o comando `tsc` para fazer testes; use somente o lint para verificação estática.** Testes funcionais previstos pelas specs usam as ferramentas e scripts que a spec implementar, sem `tsc`.

## Convenções

- Código de domínio não importa Express, Prisma, Next.js, WebSocket ou provedores. Portas ficam internas; adaptadores concretos ficam na infraestrutura.
- Uma migração de banco acompanha cada mudança de schema. Não tomar código Prisma gerado como fonte de verdade; o schema será criado do zero.
- Serviços HTTP e contratos são definidos em `specs/shared/api-contracts.md`; autorização ocorre no servidor, inclusive por paciente e vínculo assistencial. Toda leitura/alteração sensível relevante é auditada.
- Interface em pt-BR; tokens, estados, responsividade e acessibilidade seguem o design system. Não usar cor como único indicador clínico.
- Parâmetros de política são lidos de `specs/shared/parameters.md`; specs e testes referenciam a chave. Valores provisórios permanecem identificados.
- Adaptadores de desenvolvimento de assinatura e malware são bloqueados em produção. Cobertura parcial e portões constam em `specs/04-open-questions.md`.
- Ao concluir uma spec, confira os critérios de aceite, testes pertinentes, lint e escopo. Atualize a matriz de rastreabilidade somente para cobertura efetivamente implementada.
