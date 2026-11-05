# BE-023 - Cancelamento e liberação de horário

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; consumo da oportunidade integra BE-024 e lembretes BE-025
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
- [x] Dado paciente fora de RN-004, quando cancelar online, então 409 orienta recepção e consulta segue ativa.
- [x] Dado cancelamento autorizado, quando concluir, então status/histórico permanecem, reserva fica livre e aviso/evento de oportunidade são agendados uma vez; oferta é consumida por BE-024.
- [x] Dado profissional de outro atendimento, quando cancelar, então 403/404 sem mudança.
- [x] Dada falha do canal de aviso, quando processar, então cancelamento permanece e falha aparece para retry/recepção.

## 6. Testes esperados
Prazos, representação, profissional próprio, rollback, idempotência, liberação, origem clínica e outbox; lint.

## 7. Definition of Done
- [x] Nenhum DELETE de consulta; mutação/auditoria atômicas e contrato respeitado.
- [x] Testes pertinentes/lint passam, sem `tsc`; oferta fica em BE-024.

## 8. Suposições e pontos em aberto
Política operacional de contato após cancelamento pela clínica depende dos canais ativos Q-18; SMS/WhatsApp não são usados na V1.

## Evidência local — 05/11/2026

Arquivo original lido integralmente, da primeira à última das 38 linhas. P-28 e contrato compartilhado detalham origem, motivo, consentimento e sinal de liberação. Cancelamento de consulta futura ativa é versionado, idempotente, auditado e transacional com histórico, liberação, invalidação de avisos, nova outbox e `SlotReleaseEvent`. Remarcação BE-022 também publica o evento do intervalo anterior. A outbox de oportunidade é única por consulta/versão e não inclui conteúdo clínico; BE-024 consumirá o evento e revalidará a vaga antes de oferecer. `waitlistTriggered` não afirma oferta já criada.

Nove testes HTTP/PostgreSQL passaram: liberação/idempotência/histórico; profissional próprio/origem/motivo; prazo e limite exato RN-004; representação/IDOR/papéis; revogação com portal 401 e zero envio, permitindo liberação assistida justificada; falha posterior de canal com retry; corrida cancelar/reagendar; rollback total por falha de auditoria; resolução de impactos permitindo inativar profissional, sala e especialidade sem perder FKs históricas. Reagendamento junto: 18/18. Lint aprovado em 162 arquivos. P-01 continua sendo o portão jurídico do tratamento administrativo após revogação; sem liberação de conteúdo clínico.

**Regressão completa ao concluir:** 61/61 integrações backend, 25/25 testes Node e 2/2 Vitest aprovados; lint backend em 162 arquivos.
