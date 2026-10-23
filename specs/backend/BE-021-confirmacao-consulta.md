# BE-021 - Confirmação de consulta e alocação de sala

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** BE-010, BE-011, BE-020, BE-006
- **Requisitos cobertos:** RF-007, RN-001, RN-002, RN-003, RN-006

## 1. Objetivo
Confirmar consulta de paciente/responsável ou recepção, reservando profissional e sala presencial de forma atômica e emitindo confirmação segura.

## 2. Escopo
- Inclui: migration `Appointment`/histórico, regras de elegibilidade, escolha automática de sala, alerta de duplicidade e evento de confirmação.
- NÃO inclui: reagendamento (BE-022), vídeo operacional (M3) ou acesso clínico temporal (BE-030).

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1` (appointments), `specs/shared/data-model.md#m1`, `specs/shared/business-rules.md` RN-001–006, Q-05/Q-07/Q-18 e DRS §3.2.2.

## 4. Detalhamento
- Verificar paciente/GuardianLink, consentimento vigente, profissional/especialidade ativos, modalidade, duração e antecedência RN-003 no portal. Autoagendamento suspenso por RN-006 falha; recepção ainda pode agendar. Consulta futura na mesma especialidade devolve `DUPLICATE_SPECIALTY_WARNING` até confirmação explícita.
- Para presencial, escolher sala ativa livre deterministicamente e revalidar em BE-020; somente recepção pode pedir troca por outra sala livre. Profissional não escolhe. Sem sala livre, 409; remoto tem `roomId=null` e referência de entrada M3, sem sessão de vídeo simulada no M1.
- Persistir consulta/reserva/histórico/auditoria em transação. Publicar evento idempotente a BE-006 após commit; falha do canal fica registrada e sinalizada, sem apagar consulta. BE-030 no M2 reconcilia consultas já confirmadas e passa a criar `CareLink` em novas confirmações.

## 5. Critérios de aceite
- [ ] Dado paciente sem consentimento ou dependente sem vínculo, quando confirmar, então 409/403 e nenhuma reserva é criada.
- [ ] Dada consulta futura da mesma especialidade, quando confirmar sem ciência, então há aviso estável; com `confirmDuplicateSpecialty`, a operação pode seguir se o slot estiver livre.
- [ ] Dado presencial com profissional livre e todas salas ocupadas, quando confirmar, então 409; com sala livre, uma é reservada junto ao profissional.
- [ ] Dado remoto de especialidade não habilitada, quando confirmar, então 400; remoto válido não reserva sala.
- [ ] Dada falha do e-mail após commit, quando confirmar, então consulta permanece e `notificationState` registra falha/retry sem duplicar reserva.

## 6. Testes esperados
Consentimento/representação, suspensão, duplicidade, modalidades, sala auto/troca, concorrência BE-020, outbox e auditoria; lint.

## 7. Definition of Done
- [ ] Endpoint e migration seguem contrato único; sessão remota real marcada M3.
- [ ] Testes/lint passam; nenhuma reserva parcial ou `tsc`.

## 8. Suposições e pontos em aberto
Critério de desempate entre salas é decisão técnica documentada pelo implementador, sem prioridade clínica presumida. P-01 regula representação/consentimento em produção.
