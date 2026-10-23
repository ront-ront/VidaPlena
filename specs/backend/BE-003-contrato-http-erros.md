# BE-003 - Contrato HTTP, validação e erros

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-001
- **Requisitos cobertos:** RNF-021

## 1. Objetivo
Padronizar entrada/saída HTTP e erros acionáveis em pt-BR antes de expor regras de negócio. Evitar vazamento de detalhe técnico ou dado sensível.

## 2. Escopo
- Inclui: middleware de requestId, validação na borda, serialização do erro em `api-contracts.md`, not-found e erro inesperado.
- NÃO inclui: endpoints de domínio, autorização de recurso (BE-005) ou UI de erro (FE-002).

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md` (“Convenções gerais”), `specs/backend/architecture.md`, DRS §4.6.2 e `specs/00-constitution.md`.

## 4. Detalhamento
- Controllers convertem DTO validado em chamada de use case e resultado em status/payload. Mapeamento único de erros de domínio → `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND_OR_FORBIDDEN`, `CONFLICT`, `CONSENT_REQUIRED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`.
- Resposta contém `error.code/message/details/requestId`; mensagens explicam causa e próxima ação quando possível, sobretudo conflito de agenda futuro. Exceção não conhecida retorna 500 genérico e é registrada em log técnico com requestId sem segredos.
- Validações de tipos/formato ficam na borda; regras de negócio permanecem em use cases. Não devolver stack trace, SQL, token, senha ou conteúdo clínico.

## 5. Critérios de aceite
- [ ] Dado campo inválido, quando chamar endpoint, então 400 traz campo e correção sem descartar campos válidos no cliente.
- [ ] Dada rota inexistente, quando chamar, então resposta 404 segue o mesmo envelope e requestId.
- [ ] Dada falha inesperada, quando ocorrer, então o usuário recebe mensagem genérica acionável e nenhum stack/segredo.
- [ ] Dado conflito de recurso, quando ocorrer, então 409 tem código estável para FE exibir alternativa.

## 6. Testes esperados
Testes HTTP de erro de validação, 404, conflito e 500 sanitizado, inclusive correlação por requestId. Lint do backend.

## 7. Definition of Done
- [ ] Envelope e códigos coincidem com contrato compartilhado.
- [ ] Nenhum controller contém regra de negócio ou formata erro próprio.
- [ ] Testes e lint pertinentes passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Biblioteca de validação concreta é escolha técnica de implementação; a semântica do contrato é fixa aqui.
