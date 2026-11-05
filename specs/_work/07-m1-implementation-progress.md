# Implementação M1 — Agenda

Objetivo autorizado em 04/11/2026: implementar integralmente M1 na ordem de `03-implementation-order.md`, uma spec por vez, seguindo os padrões do M0. Nunca executar `tsc` como teste. Repositório iniciou limpo no commit `1727be3`.

| Spec | Estado | Evidência / próxima verificação |
| --- | --- | --- |
| BE-016 | Integrada a consultas | Catálogo versionado; duração nova preserva consulta anterior; inativação/modalidade com consulta futura bloqueada e impacto seguro. Resolução operacional será exercitada em BE-022/023. |
| BE-017 | Integrada a consultas | Salas unitárias, unicidade/RBAC/auditoria; inativação com consulta futura bloqueada e sala inativa recusada na confirmação. Resolução operacional será exercitada em BE-022/023. |
| BE-018 | Implementada localmente | Snapshot/fuso/versão/RBAC, impacto ordinário recusado, emergência mantém reservas e enfileira avisos por publicação. Catálogo/grade e confirmação aprovados; resolução operacional segue BE-022/023. |
| BE-019 | Implementada localmente; desempenho pendente | Disponibilidade lê ocupação real, bloqueios, salas, duração, modalidade e antecedência. Carga/p95 permanece BE-051. |
| BE-020 | Barreira integrada e testada | Cinco testes PostgreSQL passaram após adequar fixtures à FK, sem afrouxar constraints. Corrida HTTP, sala e rollback aprovados; encaixe BE-024 e carga BE-051 pendentes. |
| BE-021 | Implementada localmente | 9/9 testes HTTP/PostgreSQL: confirmação/idempotência/duração, consentimento/representação, sala/modalidade, concorrência, outbox, rollback e impactos administrativos. Autenticação/convite/confirmação 13/13 após correção BIGINT; lint. |
| BE-022 | Implementada localmente | Reagendamento/listagem própria; 9/9 HTTP/PostgreSQL, com confirmação 18/18; origem clínica, limite RN-004/RN-003, corrida/rollback, transferência, representação e paginação. Planejamento de novos lembretes integra BE-025. |
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

## Continuação após os commits — 05/11/2026

As cinco falhas de fixtures foram corrigidas com consulta/reserva na mesma transação real. Integrações de impacto de catálogo/sala/grade foram ligadas e testadas; bloqueio emergencial enfileira aviso e preserva reserva. Confirmação passou 9/9, e autenticação/convites/confirmação passaram 13/13 após migration BIGINT para versões de notificação por timestamp. Os 25 testes Node, 2 Vitest e lint passaram. A regressão completa inicial encontrou somente os dois overflows agora corrigidos (40/42); nova execução completa em andamento. Não confundir esse resultado histórico com falha atual. BE-022 será a próxima spec; M1 continua ativo e incompleto.

Regressão completa após BIGINT: 42/43 integrações passaram. A única falha foi a asserção que serializava a linha Prisma inteira em `patient-registration.test.ts`; o teste foi adaptado para converter BIGINT em string preservando a checagem de ausência de token. Reteste desse arquivo: 2/2 aprovados. Nenhum endpoint serializa a linha bruta de notificação: listagem/atenção usam projeções, e a porta de entrega converte a versão. Falhas de produto detectadas nesta rodada foram corrigidas; o fechamento integral será reexecutado com os próximos módulos.

## Fechamento local até BE-022 — 05/11/2026

Reagendamento e confirmação: 18/18 integrações pertinentes. Regressão completa atual: **52/52 integrações backend, 25/25 testes Node e 2/2 Vitest aprovados**. Lint backend em 159 arquivos aprovado; nenhum `tsc`. O resultado substitui as falhas históricas de fixtures/overflow/serialização. Próxima spec: BE-023 (38 linhas lidas integralmente), seguida de BE-024/025 (39/39 linhas lidas integralmente). Novos lembretes permanecem ponto de integração de BE-025.
