# BE-023 - Cancelamento e liberação de horário

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** BE-021, BE-006
- **Requisitos cobertos:** RF-010, RN-004

## 1. Objetivo
Cancelar consulta futura sem apagar histórico, liberar a reserva e disparar avisos e oportunidade de lista de espera.

## 2. Escopo
- Inclui: prazo de auto cancelamento, origem/motivo, transição de status, liberação atômica e evento de espera/notificação.
- NÃO inclui: oferta da espera (BE-024), remarcação (BE-022), no-show (BE-027).

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1`, `specs/shared/data-model.md#m1`, DRS §3.2.5, RN-004/005 e Q-18.

## 4. Detalhamento
- Paciente/responsável só cancela consulta própria/dependente dentro do prazo RN-004; fora, recepção intermedeia e registra autor/razão. Profissional pode cancelar atendimento próprio com origem clínica explícita; ação sobre consulta alheia é negada.
- Transação altera status para `cancelled`, grava `AppointmentHistory`/AuditEvent e libera `SlotReservation`; não executa DELETE. Evento pós-commit avisa envolvidos, invalida lembretes e aciona BE-024 quando disponível. Falha de canal não desfaz cancelamento.
- Cancelamento pela clínica destaca sua origem e fornece alternativas de RF-006; não altera contagem de no-show.

## 5. Critérios de aceite
- [ ] Dado paciente fora de RN-004, quando cancelar online, então 409 orienta recepção e consulta segue ativa.
- [ ] Dado cancelamento autorizado, quando concluir, então status/histórico permanecem, reserva fica livre e aviso/oferta são agendados uma vez.
- [ ] Dado profissional de outro atendimento, quando cancelar, então 403/404 sem mudança.
- [ ] Dada falha do canal de aviso, quando processar, então cancelamento permanece e falha aparece para retry/recepção.

## 6. Testes esperados
Prazos, representação, profissional próprio, rollback, idempotência, liberação, origem clínica e outbox; lint.

## 7. Definition of Done
- [ ] Nenhum DELETE de consulta; mutação/auditoria atômicas e contrato respeitado.
- [ ] Testes/lint passam, sem `tsc`; oferta fica em BE-024.

## 8. Suposições e pontos em aberto
Política operacional de contato após cancelamento pela clínica depende dos canais ativos Q-18; SMS/WhatsApp não são usados na V1.
