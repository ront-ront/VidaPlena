# BE-026 - Check-in e fila de atendimento

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
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
- [ ] Dada consulta confirmada para o dia, quando recepção registrar chegada, então horário/ator persistem e consulta aparece na fila do profissional correto.
- [ ] Dada chegada além de `appointment.late_tolerance_minutes`, quando registrar, então `lateFlag=true` e nenhuma ausência é criada automaticamente.
- [ ] Dado check-in repetido ou consulta cancelada, quando chamar, então não duplica evento ou retorna 409 conforme estado.
- [ ] Dado profissional distinto, quando pedir fila alheia, então 403 e dados não aparecem.

## 6. Testes esperados
Data/fuso, tolerância parametrizada, idempotência, estado cancelado, fila ordenada, IDOR e auditoria; lint.

## 7. Definition of Done
- [ ] Fila administrativa sem conteúdo clínico, contrato/status consistentes.
- [ ] Testes/lint passam; demanda espontânea usa BE-024, sem `tsc`.

## 8. Suposições e pontos em aberto
O horário de chegada informado pela UI é conferido pelo servidor; alterações retroativas exigem auditoria. Default de tolerância ainda aguarda decisão Q-16.
