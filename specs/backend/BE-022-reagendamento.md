# BE-022 - Reagendamento transacional

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** BE-020, BE-021
- **Requisitos cobertos:** RF-009, RN-004

## 1. Objetivo
Transferir consulta futura para outro intervalo/profissional/modalidade preservando o original se a nova reserva falhar e mantendo histórico auditável.

## 2. Escopo
- Inclui: prazo de autoatendimento RN-004, troca atômica, motivo/origem, histórico, notificação e reprogramação de lembrete.
- NÃO inclui: cancelamento definitivo (BE-023), política de oferta da espera (BE-024), UI (FE-014/016).

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1`, `specs/shared/data-model.md#m1`, `specs/shared/business-rules.md` RN-001/004, DRS §3.2.4 e Q-07.

## 4. Detalhamento
- Paciente/responsável só altera consulta própria/dependente antes do limite RN-004; após isso, recepção registra motivo. Remarcação por profissional/clínica identifica a origem, informa paciente e oferece próximos horários.
- Use case revalida elegibilidade, duração, modalidade, sala e `expectedVersion`. BE-020 adquire nova reserva e libera a antiga na mesma transação; cria histórico ligado ao atendimento original. Em conflito/timeout, original permanece idêntico.
- Commit gera eventos de alteração para paciente/profissional, invalida lembretes anteriores e agenda novos via BE-025 quando disponível; outbox evita perda/duplicidade de aviso.

## 5. Critérios de aceite
- [ ] Dado prazo RN-004 ultrapassado, quando paciente tentar remarcar, então 409 orienta recepção e original permanece.
- [ ] Dado novo slot tomado concorrentemente, quando tentar, então 409 `SLOT_UNAVAILABLE`, reserva e dados originais permanecem, sem histórico falso.
- [ ] Dado pedido da clínica, quando confirmar, então histórico/aviso identificam origem e próximos horários elegíveis são oferecidos.
- [ ] Dada troca presencial/remota válida, quando concluir, então só o novo recurso é ocupado e a antiga reserva fica liberada.

## 6. Testes esperados
Prazo, IDOR, concorrência, rollback, troca de sala/modalidade, histórico, eventos e reprogramação de lembrete; lint.

## 7. Definition of Done
- [ ] Uma unidade de trabalho atômica; contrato/erro estáveis e autoria auditada.
- [ ] Testes/lint passam, sem `tsc`; notificação não altera resultado da reserva.

## 8. Suposições e pontos em aberto
O pedido de remarcação após prazo pela recepção usa motivo obrigatório; lista de alternativas segue a busca atual, sem garantia de reserva até confirmação.
