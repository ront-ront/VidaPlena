# BE-017 - Cadastro e inativação de salas

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** base implementada localmente; impacto e recusa de reserva aguardam BE-020/021/022/023
- **Depende de:** BE-005, BE-016
- **Requisitos cobertos:** RF-007, RF-008, RN-001

## 1. Objetivo
Cadastrar somente salas físicas de capacidade unitária e disponibilizar seu estado para a reserva presencial, preservando histórico.

## 2. Escopo
- Inclui: migration `Room`, leitura operacional, criação/edição/inativação por admin/gestor e verificação de impacto futuro.
- NÃO inclui: escolha/garantia de reserva (BE-020/021), equipamentos, capacidade maior que um ou compatibilidade por especialidade.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m1`, `specs/shared/api-contracts.md#m1`, `specs/shared/business-rules.md` RN-001, `specs/shared/access-policy.md`, Q-07 e DRS §3.2.3.

## 4. Detalhamento
- Sala tem ID estável, nome e status ativa/inativa; capacidade é 1 na V1. Nome válido/único entre ativas; inativação não altera consulta histórica nem remove FK.
- Antes de inativar sala com consulta futura, devolver impacto e exigir decisão de realocação/cancelamento. A mudança de sala futura passa pela barreira BE-020 e gera histórico/auditoria, sem liberar intervalo até substituição confirmada.
- `GET /v1/rooms` é leitura operacional; paciente não escolhe sala e profissional não troca sala.

## 5. Critérios de aceite
- [x] Dado gestor/admin, quando criar sala ativa, então ela entra no conjunto de salas elegíveis; outro perfil recebe 403 para mutação.
- [x] Dado nome duplicado ativo, quando criar/renomear, então 409 sem duplicação.
- [ ] Dada sala com consulta futura, quando inativar sem decisão, então 409 com impacto e reserva permanece; após resolução explícita, sala fica inativa e histórico preservado.
- [x] Dada sala inativa, quando tentar nova reserva presencial nela, então a confirmação é recusada.

## 6. Testes esperados
CRUD sem DELETE, unicidade, RBAC, FK histórica, inativação com impacto e auditoria; lint backend.

## 7. Definition of Done
- [ ] Migration e use cases limitados a sala; nenhuma capacidade/equipamento futuro criado.
- [ ] Testes/lint passam; regra de exclusão física ausente, sem `tsc`.

## 8. Suposições e pontos em aberto
Resolução operacional da consulta afetada ocorre via BE-022/023; esta spec apenas exige a decisão e impede a inativação destrutiva até a operação existir.

## Evidência local — 04/11/2026

Migration `202611040017_rooms`, capacidade 1 protegida por CHECK, índice único parcial por nome ativo normalizado, DELETE bloqueado, CRUD sem DELETE com versão e auditoria. A suíte de catálogo passou 3/3 testes HTTP/PostgreSQL, incluindo concorrência de nomes, RBAC, reativação conflitante, capacidade e histórico preservado; lint aprovado em 128 arquivos. A porta de impacto será ligada a `Appointment` em BE-021, quando haverá evidência real de inativação com consulta futura e recusa de reserva em sala inativa.

**Integração BE-021 em 05/11/2026:** inativação com consulta futura devolve impacto seguro e preserva status/reserva; confirmação recusa sala inativa e ausência de sala livre mesmo com profissional disponível. Resolução por BE-022/023 ainda será exercitada.
