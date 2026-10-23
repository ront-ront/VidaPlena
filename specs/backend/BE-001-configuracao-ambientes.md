# BE-001 - Configuração, ambientes e composition root

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** nenhuma
- **Requisitos cobertos:** RNF-024

## 1. Objetivo
Preparar a aplicação Express para configuração validada e ambientes separados, sem acoplar domínio a framework. É a base de injeção dos adaptadores das specs posteriores.

## 2. Escopo
- Inclui: configuração tipada, leitura de ambiente, bootstrap HTTP, composition root, CORS allowlist, desligamento gracioso e separação dev/homolog/prod.
- NÃO inclui: identidade, migrations, logs/health e implantação em nuvem (BE-002/014/015).

## 3. Contexto necessário
Ler `specs/00-constitution.md`, `specs/backend/architecture.md` (“Regra de dependência e pastas”; “Contratos e composição”), `specs/shared/api-contracts.md` (“Convenções gerais”), DRS §4.7.2 e `docs/architecture.md`.

## 4. Detalhamento
- Partir de `apps/backend/src/shared/infra/http/app.ts` e `server.ts`; composição instancia serviços/adaptadores na borda. `domain` e `application` não importam Express/Prisma.
- Definir contrato de configuração para ambiente, porta, URL do banco, CORS, cookies, secrets e provedores. Valores ausentes ou incompatíveis em produção impedem startup; não imprimir secrets. Domínios de front/back, SameSite, Origin e CSRF de `api-contracts.md` devem ser fixados antes de sessão real: **suposição técnica pendente**, registrar em `04-open-questions.md` se não definidos.
- Desativar CORS irrestrito do esqueleto atual. Provedores de desenvolvimento proibidos em produção são checados no bootstrap, mesmo que seus adaptadores venham depois. Mapear ambientes separados e requisito de região Brasil para o deployment futuro.

## 5. Critérios de aceite
- [ ] Dado ambiente sem variável obrigatória, quando iniciar, então falha com erro de configuração sem revelar segredo.
- [ ] Dada origem fora da allowlist, quando chamar a API, então a origem não recebe permissão CORS.
- [ ] Dado ambiente de produção com adaptador dev proibido, quando iniciar, então o processo recusa a configuração.
- [ ] Dado sinal de término, quando desligar, então listener para de aceitar novas conexões e encerra recursos da composition root.

## 6. Testes esperados
Testes de configuração inválida e CORS; teste de bootstrap com adaptadores falsos e fechamento. Lint do backend, sem `tsc`.

## 7. Definition of Done
- [ ] Código limitado ao bootstrap/configuração; dependências voltadas para dentro.
- [ ] Configuração de prod falha fechada; segredos não aparecem em logs.
- [ ] Testes pertinentes e `yarn workspace vida-plena-backend lint` passam; contrato e escopo conferidos.

## 8. Suposições e pontos em aberto
Nomes de variáveis e política de domínio/cookie são decisões técnicas deste contrato, ainda sem ambiente-alvo informado. RNF-024 só será verificado em produção após infraestrutura nacional real (P-07).
