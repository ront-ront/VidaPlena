# BE-026 - Check-in e fila de atendimento

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente
- **Depende de:** BE-021, BE-022
- **Requisitos cobertos:** RF-014

## 1. Objetivo
Registrar chegada presencial e disponibilizar fila ordenada ao profissional, incluindo atraso e pendências cadastrais administrativas.

## 2. Escopo
- Inclui: migration `CheckIn`, check-in pela recepção, `lateFlag`, fila própria e sinalização de demanda espontânea para BE-024.
- NÃO inclui: evolução clínica, decisão de encaixe/reagendamento, marcação automática de no-show.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1` (check-in/fila), `specs/shared/data-model.md#m1`, `specs/shared/parameters.md` (`appointment.late_tolerance_minutes`), DRS §3.2.9 e Q-16.

## 4. Detalhamento
- Recepção localiza consulta do dia, confirma identidade administrativa e grava `arrivedAt`, ator e status `waiting`; duplicar check-in retorna estado existente sem duplicar evento. Pendência de contato/consentimento aparece sem dados clínicos.
- Atraso superior a `appointment.late_tolerance_minutes` é sinalizado, não vira no-show automaticamente; recepção decide manter, encaixar via BE-024 ou reagendar via BE-022. Sem consulta, demanda espontânea segue a barreira de encaixe e sala livre.
- Profissional vê somente sua fila, ordenada pelo horário previsto, com chegada/status; acesso à ficha clínica ainda depende de BE-030.

## 5. Critérios de aceite
- [x] Dada consulta confirmada para o dia, quando recepção registrar chegada, então horário/ator persistem e consulta aparece na fila do profissional correto.
- [x] Dada chegada além de `appointment.late_tolerance_minutes`, quando registrar, então `lateFlag=true` e nenhuma ausência é criada automaticamente.
- [x] Dado check-in repetido ou consulta cancelada, quando chamar, então não duplica evento ou retorna 409 conforme estado.
- [x] Dado profissional distinto, quando pedir fila alheia, então 403 e dados não aparecem.

## 6. Testes esperados
Data/fuso, tolerância parametrizada, idempotência, estado cancelado, fila ordenada, IDOR e auditoria; lint.

## 7. Definition of Done
- [x] Fila administrativa sem conteúdo clínico, contrato/status consistentes.
- [x] Testes/lint passam; demanda espontânea usa BE-024, sem `tsc`.

## 8. Suposições e pontos em aberto
O horário de chegada informado pela UI é conferido pelo servidor; alterações retroativas exigem auditoria. Default de tolerância ainda aguarda decisão Q-16.


## Evidência de implementação local — 12/11/2026

Migration `202611120026_checkin` preserva chegada/registro/ator, tolerância e fuso, sem UPDATE/DELETE; a unicidade é por consulta/versão efetiva para preservar histórico após remarcação assistida. Check-in, mudança a `waiting`, histórico, auditoria e invalidação de avisos compartilham transação, mantendo reserva profissional/sala. P-31 completa o contrato de tempo manual, consentimento e resolução de atraso. Agenda e fila retornam apenas projeção administrativa, com identidade limitada por papel, filtros, contadores, paginação e auditoria. Sem consulta, usar BE-024 para obter reserva antes da chegada; o check-in não cria encaixe.

**9/9 integrações específicas aprovadas**, incluindo três check-ins concorrentes, rollback por falha de auditoria, fuso/limites, isolamento profissional, consentimento, remarcação de espera e paginação com 32 consultas reais. **Regressão final de 101/101 integrações backend aprovada após a revisão do dispatcher BE-025.** Node 25/25, Vitest 2/2 e lint backend em 188 arquivos aprovados; nenhum `tsc`. Logs em `/tmp/vidaplena-be026-*.log`. Primeiro teste adicional de paginação usava os campos da projeção pública no PATCH administrativo; fixture corrigida para `defaultMinutesFirst/defaultMinutesReturn` e retestada, sem alterar o contrato de catálogo.

Revisão jurídica P-01 e parâmetro Q-16 permanecem antes da operação real. Acesso clínico continua fechado até BE-030. Alterações sem commit por instrução do usuário.

### Correção de dependência P-43 — 13/11/2026

Agenda inclui localDate/clinicTimeZone/serverNow e aceita data omitida como dia corrente da clínica. Fila continua exigindo data. Dez testes check-in/agenda/fila aprovados, inclusive fronteira de dia diferente do UTC e data inválida. Lint216 arquivos aprovado; sem migração/RBAC novo. Fonte ManageArrivals232 linhas lida integralmente antes da alteração.

### Correção de dependência P-46 — 13/11/2026

Agenda projeta patientChangeDeadline derivado de RN-004 e última origem administrativa P-41, sem motivo/autor/snapshots. Profissional recebe lastChange=null; consulta de histórico mínimo ocorre só na projeção administrativa. Schema Zod único appointmentLastChange é compartilhado com lista própria e OpenAPI. Sem migração/RBAC novo. Adaptador247 linhas lido integralmente em blocos sequenciais.

14/14 integrações (11 chegada/agenda+3 política própria) aprovadas; revisão final de schemas4/4 (P-46+P-41) e lint backend219/front76. A primeira edição automatizada parou antes dos schemas; patch completado e parse das respostas acrescentado aos testes, sem deixar contrato divergente. FE-016 ainda pendente.
