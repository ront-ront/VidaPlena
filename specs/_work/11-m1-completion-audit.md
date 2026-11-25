# Auditoria de conclusão da implementação M1 — 24/11/2026

**Estado: implementação local M1 concluída e verificada.** Objetivo original: concluir a implementação de toda a M1, sem iniciar M2. Escopo oficial:25 specs, BE-016–029 eFE-010–020, conforme `../03-implementation-order.md`. Homologação clínica/jurídica, ensaios com pessoas e carga BE-051 não são comprovados por testes locais.

## Evidência por spec e critério

Arquivos de integração abaixo estão em `apps/backend/tests/integration/`; testes de navegador em `apps/frontend/tests/e2e/`. Critérios permanecem nas seções5/7 de cada spec, lidas por inteiro nesta auditoria. A tabela relaciona todos os157 itens de aceite/DoD a uma suíte ou a uma pendência explícita; marcação documental sozinha não prova execução. Resultados terminais ficam na seção de execução.

| Spec | Itens verificados / pendentes documentados | Suítes que exercitam o comportamento |
| --- | --- | --- |
| [BE-016](../backend/BE-016-profissionais-especialidades.md) | 6/6 marcados; sem item documental aberto | catalog.test.ts, booking.test.ts, cancellation.test.ts |
| [BE-017](../backend/BE-017-salas.md) | 6/6 marcados; sem item documental aberto | catalog.test.ts, booking.test.ts, cancellation.test.ts |
| [BE-018](../backend/BE-018-grade-bloqueios.md) | 6/6 marcados; sem item documental aberto | catalog.test.ts, schedule-editor.test.ts, booking.test.ts |
| [BE-019](../backend/BE-019-disponibilidade.md) | 5/6 marcados; pendências: Dada massa/carga de `shared/performance-scenario.md`, quando medir p95, então a consulta atende `perf.availability_p95_ms`; resultado real fica pendente até BE-051. | catalog.test.ts, booking.test.ts, scheduling-context.test.ts |
| [BE-020](../backend/BE-020-reserva-atomica.md) | 7/7 marcados; sem item documental aberto | reservations.test.ts, booking.test.ts, waitlist.test.ts, appointment-imports.test.ts |
| [BE-021](../backend/BE-021-confirmacao-consulta.md) | 7/7 marcados; sem item documental aberto | booking.test.ts, booking-display.test.ts, room-options.test.ts |
| [BE-022](../backend/BE-022-reagendamento.md) | 6/6 marcados; sem item documental aberto | rescheduling.test.ts, own-appointment-policy.test.ts, checkin.test.ts |
| [BE-023](../backend/BE-023-cancelamento.md) | 6/6 marcados; sem item documental aberto | cancellation.test.ts, reminders.test.ts, waitlist.test.ts |
| [BE-024](../backend/BE-024-espera-encaixe.md) | 6/6 marcados; sem item documental aberto | waitlist.test.ts, room-options.test.ts |
| [BE-025](../backend/BE-025-lembretes.md) | 7/7 marcados; sem item documental aberto | reminders.test.ts, notifications.test.ts |
| [BE-026](../backend/BE-026-checkin-fila.md) | 6/6 marcados; sem item documental aberto | checkin.test.ts, own-appointment-policy.test.ts |
| [BE-027](../backend/BE-027-ausencia-suspensao.md) | 6/6 marcados; sem item documental aberto | absence.test.ts |
| [BE-028](../backend/BE-028-importacao-pacientes.md) | 6/6 marcados; sem item documental aberto | patient-imports.test.ts |
| [BE-029](../backend/BE-029-importacao-agenda.md) | 6/6 marcados; sem item documental aberto | appointment-imports.test.ts |
| [FE-010](../frontend/FE-010-catalogo-salas.md) | 6/6 marcados; sem item documental aberto | catalog.spec.ts |
| [FE-011](../frontend/FE-011-grade-profissional.md) | 6/6 marcados; sem item documental aberto | schedule.spec.ts |
| [FE-012](../frontend/FE-012-busca-horarios.md) | 6/6 marcados; sem item documental aberto | availability.spec.ts |
| [FE-013](../frontend/FE-013-confirmacao-agendamento.md) | 5/7 marcados; pendências: Dado fluxo completo FE-012+013, quando testar navegação, então no máximo quatro interações principais; 90% em até três minutos sem auxílio requer ensaio com usuários.; Dado 360 px e leitor de tela, quando confirmar, então resumo/erro/sucesso são utilizáveis em WCAG 2.1 AA. | booking.spec.ts |
| [FE-014](../frontend/FE-014-minhas-consultas.md) | 6/6 marcados; sem item documental aberto | my-appointments.spec.ts |
| [FE-015](../frontend/FE-015-agenda-recepcao.md) | 6/7 marcados; pendências: Dada sessão de treinamento de uma hora, quando avaliar recepção, então 90% executam as quatro tarefas RNF-004 sem auxílio; evidência é ensaio com usuários, não lint. | agenda.spec.ts, reception.spec.ts, arrivals.spec.ts |
| [FE-016](../frontend/FE-016-operacao-consultas-recepcao.md) | 7/7 marcados; sem item documental aberto | reception.spec.ts |
| [FE-017](../frontend/FE-017-espera-encaixe.md) | 6/6 marcados; sem item documental aberto | waitlist.spec.ts |
| [FE-018](../frontend/FE-018-checkin-atrasos.md) | 7/7 marcados; sem item documental aberto | arrivals.spec.ts |
| [FE-019](../frontend/FE-019-csv-pacientes.md) | 6/6 marcados; sem item documental aberto | imports-patients.spec.ts |
| [FE-020](../frontend/FE-020-csv-agenda.md) | 6/6 marcados; sem item documental aberto | imports-appointments.spec.ts |

## Cobertura dos29 requisitos/diretrizes que participam de M1

A cobertura abaixo se limita à parcela M1. A matriz global85/85 permanece em `../02-traceability-matrix.md`; prontuário, teleconsulta, relatórios e demais milestones continuam planejados.

| Requisito | Specs M1 | Limite a preservar |
| --- | --- | --- |
| RF-001 | BE-028, FE-019 | Importação administrativa fictícia; cadastro/consentimento usam M0; dados reais P-07. |
| RF-006 | BE-019, FE-012, FE-015 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-007 | BE-017, BE-021, BE-029, FE-010, FE-013, FE-016, FE-020 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-008 | BE-017, BE-020, BE-029, FE-013, FE-020 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-009 | BE-022, FE-014, FE-016 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-010 | BE-023, FE-014, FE-016 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-011 | BE-018, FE-011 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-012 | BE-024, FE-017 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-013 | BE-025 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-014 | BE-026, FE-015, FE-018 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-015 | BE-027, FE-015, FE-018 | Implementação local; homologação operacional/manual permanece distinta. |
| RF-016 | BE-028 | Somente origem de cadastro importado; prontuário e histórico clínico ainda M2. |
| RF-028 | BE-016, FE-010 | Implementação local; homologação operacional/manual permanece distinta. |
| RN-001 | BE-017, BE-020, BE-021, BE-024, BE-029, FE-017 | Implementação local; homologação operacional/manual permanece distinta. |
| RN-002 | BE-016, BE-018, BE-021 | Implementação local; homologação operacional/manual permanece distinta. |
| RN-003 | BE-019, BE-021, BE-024 | Implementação local; homologação operacional/manual permanece distinta. |
| RN-004 | BE-022, BE-023, FE-014 | Implementação local; homologação operacional/manual permanece distinta. |
| RN-005 | BE-025, BE-027 | Implementação local; homologação operacional/manual permanece distinta. |
| RN-006 | BE-021, BE-027 | Implementação local; homologação operacional/manual permanece distinta. |
| RNF-001 | FE-012, FE-013 | Ensaio90%/três minutos com participantes pendente; não comprovado por automação. |
| RNF-002 | FE-015, FE-016, FE-018 | Implementação local; homologação operacional/manual permanece distinta. |
| RNF-004 | FE-013, FE-015 | Treinamento/ensaio com recepção e profissional pendentes; interface clínica M2. |
| RNF-009 | BE-019 | Ensaios p95 com massa/carga oficial dependem de BE-051/M4. |
| RNF-010 | BE-020 | Concorrência real verificada; crescimento/carga formal dependem de BE-051/052. |
| RNF-016 | BE-028 | Minimização/RBAC/auditoria/importação implementados; LGPD jurídico P-01 e módulos posteriores pendentes. |
| RNF-019 | FE-012 | Responsividade M1 automatizada; conformidade transversal de telas futuras e leitor de tela pendentes. |
| RNF-021 | FE-013, FE-019, FE-020 | Mensagens e recuperação M1; telas futuras permanecem nas respectivas specs. |
| UI-009 | FE-015 | Implementação local; homologação operacional/manual permanece distinta. |
| UI-011 | FE-015 | Implementação local; homologação operacional/manual permanece distinta. |

## Invariantes e entregáveis inspecionados

- Contratos definidos em `shared/api-contracts.md`, schemas Zod usados na API/OpenAPI e serviços de frontend. P-53 completa leitura de histórico de ausência; P-55 completa projeção administrativa do relatório de agenda. Sem migração adicional ou código M2.
- Dupla reserva proibida por constraints PostgreSQL e transações reais em BE-020, confirmação, remarcação, encaixe, espera e importação. Testes do browser não substituem a prova de concorrência do backend.
- Check-in/no-show manuais por papel; filtro e prazo vêm da API. Justificativa cifrada em repouso, leitura autorizada/auditada. Nenhuma alteração clínica nem exclusão de histórico.
- CSV real em duas etapas, relatório400, revisão, hash/nonce, zero conta/consentimento/aviso implícito, replay e retomada por linha. Campos/arquivos não persistidos no navegador; nonce contém apenas hash e UUID. Fonte/dados definitivos seguem Q-19/P-07.
- Todas as telas M1 do mapa possuem rota: catálogo, grade, busca, confirmação, consultas próprias, agenda, espera, importação pacientes/agenda. FE-016/018 compartilham a agenda; FE-013 compartilha `/agendar`. Prontuário explicitamente desenhado continua M2/FE-021–023.
- Validador documental executado:96 IDs únicos, oito seções em96 specs, critérios em96, dependências na sequência topológica sem ciclo;25 specs M1 e29 requisitos/diretrizes distintos, sem spec M1 órfã.
- Segurança/erros/rede/idempotência, foco, teclado,360px e scroll próprio verificados por testes específicos e inspeção visual. Leitor de tela manual não executado.

## Execução e limites

Regressões concluídas; revisão de atraso FE-018 restringe opções à recepção em atendimento aguardando e passou11/11. A primeira execução backend reportou160/160, mas o wrapper retornou143 após o término; execução direta repetida confirmou160/160 com saída0. Build inicial identificou tipagens dos testes; callbacks e fixture corrigidos, build repetido com saída0 e52/52 casos alterados aprovados. Não houve ajuste de regra de produto para contornar teste. Comandos usam Node22.22.0, PostgreSQL17 descartável `vp-m1-postgres-test`/base `_test`, Playwright Firefox isolado na porta3400/APIs simuladas, e lint. Nenhum comando `tsc`, staging, commit ou push nesta implementação. Banco e caixa de e-mails de desenvolvimento não foram usados.


| Verificação | Resultado terminal | Evidência local |
| --- | --- | --- |
| HTTP/PostgreSQL integral |160/160,0 falhas, saída0 | `/tmp/vidaplena-m1-final-backend-direct.log`, `.exit` |
| Node backend |26/26 | `/tmp/vidaplena-m1-final-node.log` |
| Vitest HTTP |2/2 | `/tmp/vidaplena-m1-final-vitest.log` |
| Firefox regressão integral |124/124 | `/tmp/vidaplena-m1-final-browser.log` |
| Firefox após revisão de atraso/tipagens |52/52: FE-01811, FE-0199, FE-02010, termos22; saída0 | `/tmp/vidaplena-m1-postbuild-browser.log`, `.exit` |
| Cliente HTTP / nonce / fuso frontend |7/7,3/3,3/3 | `/tmp/vidaplena-m1-final-front-{api,booking,schedule}.log` |
| Lint | backend213 arquivos (`src tests`), frontend100; sem erro | `/tmp/vidaplena-m1-final-{back,front}-lint.log` |
| Build Next | aprovado, saída0 | `/tmp/vidaplena-m1-final-build-recheck.log`, `.exit` |
| Integridade do diff | `git diff --check` aprovado | Git local; índice vazio |

Conjuntos de navegador se sobrepõem;124+52 não representam176 casos únicos. Asserções de UI usam APIs simuladas; persistência, autorização, auditoria e concorrência são exercitadas por160 integrações com PostgreSQL real. Logs temporários não são versionados; comandos reproduzíveis abaixo. A auditoria registra resultado local, sem inventar homologação.

### Reprodução

Com Node22.22.0 no PATH e `TEST_DATABASE_URL` apontando exclusivamente a PostgreSQL17 descartável/base com sufixo `_test`:

1. Em `apps/backend`, `DATABASE_URL="$TEST_DATABASE_URL" yarn prisma migrate deploy`, depois `node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts`.
2. `yarn workspace vida-plena-backend test` e `yarn workspace vida-plena-backend test:vitest`.
3. `yarn workspace vida-plena-frontend test:e2e` (agora126 casos únicos; a execução integral registrada tinha124 antes dos dois novos casos de atraso).
4. `yarn workspace vida-plena-frontend test:api`, `test:booking`, `test:schedule`.
5. Backend: `../../node_modules/.bin/biome check src tests` dentro de `apps/backend`; frontend: `yarn workspace vida-plena-frontend lint`. Escopo evita caixa local ignorada de e-mail; ops não alteradas não foram incluídas nesta rodada.
6. Após terminar o servidor Playwright, `yarn workspace vida-plena-frontend build`; `git diff --check` na raiz. Nenhum comando `tsc`.

### Pendências preservadas e limite de conclusão

Implementação das25 specs M1 concluída; nenhum entregável de código M1 sem cobertura. Permanecem quatro itens de aceite sem comprovação local: p95 de BE-019 (BE-051/M4), ensaio RNF-001 e leitor de tela de FE-013, treinamento RNF-004 de FE-015. Outros critérios transversais de homologação manual/jurídico/parâmetros/infraestrutura continuam nas respectivas specs e `04-open-questions.md`. RF-016/prontuário é parcial por depender de M2. Estas pendências não foram marcadas como feitas nem transformadas em requisitos atendidos por lint; o encerramento é da implementação local solicitada, sem declarar prontidão clínica ou produção.

**Conferência final no disco:**153/157 itens marcados; os quatro acima continuam abertos.25/25 specs M1 aparecem na tabela de implementação da matriz.85 IDs conferidos com o inventário e metadados das96 specs; oito seções e ordem sem ciclo. Container de testes parado após execução; para reproduzir no mesmo workspace, iniciar `docker start vp-m1-postgres-test` e configurar `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:32768/vidaplena_m1_test`. Esse banco é exclusivamente de testes. Nenhum serviço/banco/caixa de e-mails de desenvolvimento foi alterado. Índice Git vazio; alterações mantidas sem commit.
