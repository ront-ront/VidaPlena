# BE-020 - Reserva atômica sem sobreposição

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** barreira e encaixe implementados/testados localmente; carga formal BE-051 pendente
- **Depende de:** BE-017, BE-018, BE-019
- **Requisitos cobertos:** RF-008, RN-001, RNF-010

## 1. Objetivo
Garantir no PostgreSQL que profissional e sala nunca tenham dois atendimentos ativos sobrepostos, inclusive sob corrida, reagendamento, espera, encaixe e importação.

## 2. Escopo
- Inclui: migration `SlotReservation`, constraints de exclusão, transação de hold/confirmação/troca/liberação e tradução de colisão para 409.
- NÃO inclui: formulário/decisão de agendamento (BE-021), políticas de lista de espera (BE-024) nem interface visual.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m1` (`SlotReservation`), `specs/shared/api-contracts.md#m1`, `specs/backend/architecture.md` A-05, DRS §3.2.3, RN-001 e Q-06/Q-07.

## 4. Detalhamento
- Migration SQL PostgreSQL habilita `btree_gist` e implementa exclusion constraint GiST por `(professionalId, tstzrange(startsAt,endsAt,'[)'))` e outra por sala não nula, somente para `held/confirmed`; `startsAt<endsAt`. Se o Prisma não expressar a constraint, mantê-la em migration SQL versionada, nunca só em `findFirst`.
- Use case recebe intervalo, modalidade, sala/hold e idempotency key; verifica elegibilidade/consentimento via chamador, trava/revalida e grava reserva+agenda/auditoria na unidade de trabalho. Falha, timeout ou colisão reverte todos os writes; 409 `SLOT_UNAVAILABLE` com alternativas seguras.
- Hold de oferta expira/libera antes de reoferta; aceite converte o mesmo hold em confirmado atomicamente. Troca libera reserva antiga somente depois de garantir nova na mesma transação. Encaixe fora da grade não contorna a constraint.

## 5. Critérios de aceite
- [x] Dadas duas confirmações simultâneas do mesmo intervalo/profissional, quando executar, então exatamente uma confirma e a outra recebe 409, com zero registro parcial.
- [x] Dadas duas salas ou profissionais independentes, quando reservar intervalos iguais, então confirmações válidas coexistem somente se ambos recursos não colidem.
- [x] Dado atendimento presencial sem sala livre, quando confirmar, então 409 mesmo que profissional esteja livre; remoto dispensa sala.
- [x] Dado encaixe fora da grade em intervalo ocupado, quando tentar, então 409 sem exceção; em intervalo livre com justificativa, a barreira permite ao caso de uso avançar.
- [x] Dada falha na troca de horário, quando transação reverter, então reserva antiga permanece confirmada.

## 6. Testes esperados
Integração PostgreSQL real com barreira simultânea, colisão parcial, dois recursos, hold expirado, rollback, idempotência e migration reexecutável; ensaio BE-051 repete em carga. Lint.

## 7. Definition of Done
- [x] Constraint no banco e porta transacional; nenhuma lógica de exclusão só em memória/Redis.
- [x] Testes de concorrência e lint passam; erro estável no contrato, sem `tsc`.

## 8. Suposições e pontos em aberto
Política de timeout transacional é escolha técnica do ambiente e deve ser medida em BE-051. A redação alternativa original do RF-008 foi substituída por “horário fora da grade” (Q-06).

## Evidência local — 05/11/2026

Migration `202611040020_reservations` cria `btree_gist`, duas constraints de exclusão `[)` para profissional/sala, integridade de modalidade/estado e histórico sem DELETE/alteração de recursos. Porta transacional e `ReserveSlot` tratam idempotência, escolha de sala, conversão/expiração de hold e troca com rollback. P-25 registra contenção/retry. Cinco testes PostgreSQL passaram, incluindo duas transações sincronizadas sem locks da aplicação, colisão de sala, adjacência, recursos independentes, remoto, rollback, payload divergente, hold e troca. Suíte M1 15/15 e lint em 145 arquivos aprovados antes da parametrização adicional das tentativas. A disponibilidade já lê reservas reais; confirmação HTTP, vínculo FK da consulta e encaixe justificado continuam BE-021/024.

**Reverificação integrada em 05/11/2026:** BE-021 adicionou a FK diferida de consulta e a consistência entre consulta ativa/reserva. A corrida HTTP passou, mas os cinco testes diretos acima falham porque suas fixtures usam consultas inexistentes. Atualizar fixtures para transações completas e repetir; o resultado 15/15 acima é histórico e não representa o estado atual. Suíte selecionada atual: 13/18; lint backend/frontend aprovado.

**Correção da regressão em 05/11/2026:** fixtures agora criam consulta/reserva na mesma transação e atualizam a consulta durante troca; 5/5 testes PostgreSQL passaram, sem relaxar FK/constraints. A corrida HTTP de BE-021 também confirmou uma única efetivação com resposta 409 concorrente.

**Integração BE-024:** encaixe justificado usa a mesma reserva/constraint e foi confirmado em intervalo livre fora de slots regulares; colisão foi recusada. Hold expirado associado a oferta real encerra oferta/entrada/notificação na mesma transação antes de outra reserva, preservando as constraints diferidas. Aceite usa a reserva original; histórico da oferta aceita continua válido após cancelamento da consulta. Carga formal continua BE-051.
