# Instruções do repositório VidaPlena

## Ordem de leitura obrigatória

1. `specs/00-constitution.md` primeiro.
2. `specs/01-overview.md`, `specs/03-implementation-order.md` e `specs/02-traceability-matrix.md`.
3. A spec BE ou FE escolhida; em seguida, apenas as seções compartilhadas que ela indica em “Contexto necessário”.
4. Para frontend, ler também `apps/frontend/AGENTS.md`, `specs/frontend/design-system.md` e `specs/frontend/screens-map.md`. Antes de escrever código Next.js, consultar a documentação da versão instalada em `apps/frontend/node_modules/next/dist/docs/`.

**Implemente somente uma spec por vez e nunca fora do escopo dela.** Não trate arquivos de referência compartilhados como autorização para implementar outras specs. Respeite dependências e registre divergências nas perguntas/matriz antes de alterar contratos.

## Stack e arquitetura

- Monorepo Yarn 1 workspaces e Turbo.
- Backend: TypeScript, Express 5, PostgreSQL 17, Prisma 7, Redis 7; Zod 4 para entrada/ambiente, TSyringe no composition root, OpenAPI 3.1 gerado por `zod-openapi` com referência Scalar. Clean Architecture descrita em `specs/backend/architecture.md`.
- Observabilidade backend: Pino para logs JSON e `@prometheus-io/client` para métricas; backup PostgreSQL com pgBackRest e arquivos com snapshot cifrado. Ver `apps/backend/ops/backup/README.md`.
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
| Testes backend existentes | `yarn workspace vida-plena-backend test` e `yarn workspace vida-plena-backend test:integration` (com `TEST_DATABASE_URL` de banco isolado `_test`) |
| Testes HTTP novos | `yarn workspace vida-plena-backend test:vitest` |
| Ciclo de backup operacional | `yarn workspace vida-plena-backend backup:cycle full` ou `backup:cycle incremental` (ambiente protegido; runbook em `apps/backend/ops/backup/README.md`) |
| Restauração de arquivos | `yarn workspace vida-plena-backend backup:files restore <repo> <diretório-vazio>` |

O backend e a raiz não possuíam script de build ou test no estado examinado em 23/10/2026; scripts de teste do backend foram adicionados na implementação M0. **NUNCA rode o comando `tsc` para fazer testes; use somente o lint para verificação estática.** Testes funcionais previstos pelas specs usam as ferramentas e scripts que a spec implementar, sem `tsc`.

## Convenções

- Código de domínio não importa Express, Prisma, Next.js, WebSocket ou provedores. Portas ficam internas; adaptadores concretos ficam na infraestrutura.
- No HTTP, declare schemas Zod por recurso e compartilhe os mesmos schemas com a geração OpenAPI. O container de DI é criado por instância de aplicação, com portas registradas na composição; domínio e use cases não acessam o container. Veja `specs/_work/04-library-adoption.md`.
- Uma migração de banco acompanha cada mudança de schema. Não tomar código Prisma gerado como fonte de verdade; o schema será criado do zero.
- Serviços HTTP e contratos são definidos em `specs/shared/api-contracts.md`; autorização ocorre no servidor, inclusive por paciente e vínculo assistencial. Toda leitura/alteração sensível relevante é auditada.
- Interface em pt-BR; tokens, estados, responsividade e acessibilidade seguem o design system. Não usar cor como único indicador clínico.
- Parâmetros de política são lidos de `specs/shared/parameters.md`; specs e testes referenciam a chave. Valores provisórios permanecem identificados.
- Adaptadores de desenvolvimento de assinatura e malware são bloqueados em produção. Cobertura parcial e portões constam em `specs/04-open-questions.md`.
- Ao concluir uma spec, confira os critérios de aceite, testes pertinentes, lint e escopo. Atualize a matriz de rastreabilidade somente para cobertura efetivamente implementada.
