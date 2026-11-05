# Implementação M1 — Agenda

Objetivo autorizado em 04/11/2026: implementar integralmente M1 na ordem de `03-implementation-order.md`, uma spec por vez, seguindo os padrões do M0. Nunca executar `tsc` como teste. Repositório iniciou limpo no commit `1727be3`.

| Spec | Estado | Evidência / próxima verificação |
| --- | --- | --- |
| BE-016 | Base local testada | Migration de catálogo, API administrativa/pública, Zod/OpenAPI, DI, RBAC e auditoria; HTTP/PostgreSQL 2/2 e lint. Duração já confirmada e impacto de inativação aguardam BE-021/022/023. |
| BE-017 | Base local testada | Migration de salas, capacidade 1, unicidade ativa, RBAC/auditoria, versão e DELETE bloqueado. Catálogo HTTP/PostgreSQL 3/3 e lint; impacto/reserva aguardam BE-020/021/022/023. |
| BE-018 | Base local testada | Snapshots/regras/bloqueios imutáveis; API, versão, propriedade, auditoria, fuso Temporal e config Zod. Catálogo/grade 4/4 integrações e 2/2 regras, lint. Slots/impactos/avisos aguardam BE-019/021/023/025. |
| BE-019 | Base local testada | API de disponibilidade sem cache, datas/fuso, duração, modalidades, bloqueios/salas, antecedência, lookahead verificado. Suíte M1 10/10 e lint; ocupação persistida BE-020/021 e p95 BE-051 pendentes. |
| BE-020 | Barreira parcial; regressão de fixtures pendente | Exclusion constraints profissional/sala, idempotência, hold/expiração, troca/rollback e retry. Cinco testes passaram antes de BE-021; com a nova FK, os cinco precisam criar consultas válidas na mesma transação. Corrida HTTP de BE-021 passou. Encaixe BE-024 e carga BE-051 pendentes. |
| BE-021 | Implementação parcial | Migration, confirmação transacional/idempotente, duração congelada, consentimento, suspensão, duplicidade, sala e outbox; 3/3 testes HTTP/PostgreSQL passaram. Guardas de impacto de catálogo/salas/grade e avisos emergenciais ainda não integrados; representação e demais critérios precisam de cobertura. |
| BE-022 | Pendente | Reagendamento |
| BE-023 | Pendente | Cancelamento |
| BE-024 | Pendente | Lista de espera/encaixe |
| BE-025 | Pendente | Lembretes |
| BE-026 | Pendente | Check-in/fila |
| BE-027 | Pendente | No-show/suspensão |
| BE-028 | Pendente | CSV de pacientes |
| BE-029 | Pendente | CSV de agenda |
| FE-010 | Pendente | Catálogo/salas |
| FE-011 | Pendente | Grade |
| FE-012 | Pendente | Busca de horários |
| FE-013 | Pendente | Confirmação |
| FE-014 | Pendente | Consultas do paciente |
| FE-015 | Pendente | Agenda da recepção |
| FE-016 | Pendente | Operações da recepção |
| FE-017 | Pendente | Espera/encaixe |
| FE-018 | Pendente | Check-in/no-show |
| FE-019 | Pendente | CSV de pacientes |
| FE-020 | Pendente | CSV de agenda |

## Ambiente de verificação

PostgreSQL 17 descartável `vp-m1-postgres-test`, publicado só em loopback na porta aleatória 32774; base `vidaplena_m1_test`. Os testes de catálogo criam, migram e removem uma base por arquivo. Nenhum dado real foi usado. Node 22.22.0 necessário para Prisma instalado. O container permanece ativo durante M1 e deve ser removido ao encerrar os ensaios.

## Decisões e auditoria de conclusão

P-22 registra modalidades `onsite/remote`, leitura administrativa privada, controle `expectedVersion` e validação sintática de conselho. Conferir ao fim: 25 specs, critérios e dependências, invariantes de concorrência profissional/sala, revalidação de consentimento/autorizações, idempotência, CSV sem conta/notificação, testes funcionais pertinentes, lint, build frontend e navegação real. M2 não faz parte deste objetivo.

## Verificação ao separar os commits — 05/11/2026

- `yarn lint`: aprovado no backend (154 arquivos) e frontend (48 arquivos); nenhum comando `tsc` executado.
- Suíte selecionada de M1: `availability.test.ts`, `schedule.test.ts`, `integration/catalog.test.ts`, `integration/reservations.test.ts` e `integration/booking.test.ts`, com Node 22 e PostgreSQL 17 isolado: **13/18 passaram; 5/18 falharam**.
- As cinco falhas estão em `reservations.test.ts`: fixtures anteriores a BE-021 referenciam UUIDs de consultas inexistentes. A FK e a consistência diferidas agora exigem consulta/reserva válidas na mesma transação. Adaptar criação, confirmação de hold e troca nas fixtures sem afrouxar constraints; repetir a suíte depois. O resultado histórico 15/15 não vale para o estado integrado atual.
- Os commits registram o trabalho parcial existente. BE-022–029 e FE-010–020 continuam pendentes; não há conclusão do M1 nem regressão completa de M0 comprovada nesta rodada.
