# BE-021 - Confirmação de consulta e alocação de sala

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; homologação jurídica/operacional permanece pendente
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
- [x] Dado paciente sem consentimento ou dependente sem vínculo, quando confirmar, então 409/403/404 conforme a política de ocultação de recurso e nenhuma reserva é criada.
- [x] Dada consulta futura da mesma especialidade, quando confirmar sem ciência, então há aviso estável; com `confirmDuplicateSpecialty`, a operação pode seguir se o slot estiver livre.
- [x] Dado presencial com profissional livre e todas salas ocupadas, quando confirmar, então 409; com sala livre, uma é reservada junto ao profissional.
- [x] Dado remoto de especialidade não habilitada, quando confirmar, então 400; remoto válido não reserva sala.
- [x] Dada falha do e-mail após commit, quando confirmar, então consulta permanece e a outbox registra falha/retry sem duplicar reserva; a resposta inicial é `notificationState:"queued"`.

## 6. Testes esperados
Consentimento/representação, suspensão, duplicidade, modalidades, sala auto/troca, concorrência BE-020, outbox e auditoria; lint.

## 7. Definition of Done
- [x] Endpoint e migration seguem contrato único; sessão remota real marcada M3.
- [x] Testes pertinentes/lint passam; nenhuma reserva parcial ou `tsc`.

## 8. Suposições e pontos em aberto
Critério de desempate entre salas é decisão técnica documentada pelo implementador, sem prioridade clínica presumida. P-01 regula representação/consentimento em produção.

## Evidência parcial — 05/11/2026

Migration `202611050021_appointments`, endpoint de confirmação e unidade de trabalho persistem consulta, reserva, histórico, comando idempotente, auditoria e outbox. Três testes HTTP/PostgreSQL passaram com duração congelada, falha posterior do canal, consentimento/sujeito alheio, suspensão, duplicidade, remoto e concorrência sem parcial. Lint aprovado. Guardas de impacto de catálogo/salas/grade e avisos emergenciais ainda não estão ligados às consultas; representação e demais critérios precisam de testes complementares. Cinco fixtures diretas de BE-020 precisam acompanhar a FK e as constraints novas. Esta evidência não conclui BE-021 nem M1.

## Integração concluída — 05/11/2026

As guardas agora consultam agendamentos ativos reais: inativação de sala/profissional/especialidade ou retirada incompatível de modalidade devolve `SCHEDULE_IMPACT_REVIEW` com somente ID e intervalo; alteração ordinária da grade também preserva a versão e as reservas. Emergência mantém reservas e enfileira aviso idempotente por publicação. As fixtures de BE-020 criam consulta/reserva na mesma transação sem relaxar as constraints; 5/5 passaram. Confirmação: 9/9 testes HTTP/PostgreSQL, incluindo responsável/dependente, vínculo encerrado, falta de sala com profissional livre, sala inativa, escolha pela recepção, antecedência e rollback de todas as gravações quando a auditoria falha. Consulta assistida sem conta digital retorna `unreachable` e mantém reserva.

A regressão de autenticação/convites detectou overflow de versão de notificação: a migration complementar `202611050021_notification_versions` usa `BIGINT`, preservando timestamps já usados por M0. Autenticação, seed/convite e confirmação passaram 13/13 após a correção; 25/25 testes Node, 2/2 Vitest e lint aprovados. Regressão completa continua registrada no diário M1. Escolha de sala segue Q-07; respostas 404 para sujeito alheio seguem `shared/access-policy.md`.
