# Implementação M1 — Agenda

Objetivo autorizado em 04/11/2026: implementar integralmente M1 na ordem de `03-implementation-order.md`, uma spec por vez, seguindo os padrões do M0. Nunca executar `tsc` como teste. Repositório iniciou limpo no commit `1727be3`.

| Spec | Estado | Evidência / próxima verificação |
| --- | --- | --- |
| BE-016 | Integrada a consultas | Catálogo versionado; duração nova preserva consulta anterior; inativação/modalidade com consulta futura bloqueada e impacto seguro. Resolução por cancelamento comprovada em BE-023, preservando histórico/FKs. |
| BE-017 | Integrada a consultas | Salas unitárias, unicidade/RBAC/auditoria; inativação com consulta futura bloqueada e sala inativa recusada na confirmação. Resolução por cancelamento comprovada em BE-023, preservando histórico/FKs. |
| BE-018 | Implementada localmente | Snapshot/fuso/versão/RBAC, impacto ordinário recusado, emergência mantém reservas e enfileira avisos por publicação. Catálogo/grade e confirmação aprovados; resolução operacional segue BE-022/023. |
| BE-019 | Implementada localmente; desempenho pendente | Disponibilidade lê ocupação real, bloqueios, salas, duração, modalidade e antecedência. Carga/p95 permanece BE-051. |
| BE-020 | Barreira integrada e testada | Cinco testes PostgreSQL passaram após adequar fixtures à FK, sem afrouxar constraints. Corrida HTTP, sala e rollback aprovados; encaixe BE-024 comprovado; carga BE-051 pendente. |
| BE-021 | Implementada localmente | 9/9 testes HTTP/PostgreSQL: confirmação/idempotência/duração, consentimento/representação, sala/modalidade, concorrência, outbox, rollback e impactos administrativos. Autenticação/convite/confirmação 13/13 após correção BIGINT; lint. |
| BE-022 | Implementada localmente | Reagendamento/listagem própria; 9/9 HTTP/PostgreSQL, com confirmação 18/18; origem clínica, limite RN-004/RN-003, corrida/rollback, transferência, representação e paginação. Planejamento de novos lembretes integra BE-025. |
| BE-023 | Implementada localmente | Cancelamento, origem clínica, autorização, prazo, liberação e outbox de oportunidade; 9/9 testes, com reagendamento 18/18. Consumo da vaga BE-024 comprovado; jobs BE-025 integrados. |
| BE-024 | Implementada localmente | Fila/oferta/hold/aceite/worker/encaixe; 17/17 integrações pertinentes; regressão completa 78/78 integrações, 25/25 Node, 2/2 Vitest e lint. P-29 detalha decisões e integrações assistidas. |
| BE-025 | Implementada localmente | 14/14 específicas, regressão final 101/101, Node 25/25, Vitest 2/2 e lint. |
| BE-026 | Implementada localmente | 9/9 específicas, paginação de 32 consultas, regressão final 101/101 e lint. |
| BE-027 | Implementada localmente | 10/10 integrações específicas, calendário 1/1; regressão 111/111, Node 26/26, Vitest 2/2 e lint. |
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

PostgreSQL 17 descartável `vp-m1-postgres-test`, publicado só em loopback na porta atual 32768 (anterior 32774 removida); base `vidaplena_m1_test`. Os testes de catálogo criam, migram e removem uma base por arquivo. Nenhum dado real foi usado. Node 22.22.0 necessário para Prisma instalado. O container permanece ativo durante M1 e deve ser removido ao encerrar os ensaios.

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

Reagendamento e confirmação: 18/18 integrações pertinentes. Regressão completa atual: **52/52 integrações backend, 25/25 testes Node e 2/2 Vitest aprovados**. Lint backend em 159 arquivos aprovado; nenhum `tsc`. O resultado substitui as falhas históricas de fixtures/overflow/serialização. Próxima spec: BE-023 (38 linhas lidas integralmente), seguida de BE-024/025 (38/39 linhas lidas integralmente). Novos lembretes permanecem ponto de integração de BE-025.

## Cancelamento BE-023 — 05/11/2026

Nove integrações de cancelamento e nove de reagendamento aprovadas (18/18); lint em 162 arquivos. Resolução de inativação de catálogo/sala agora foi exercitada até o fim: impacto recusado antes e inativação autorizada após cancelamento, com histórico/FKs preservados. Revogação de consentimento invalida o principal no M0 e retorna 401 no portal; o teste respeita esse bloqueio, sem alterar a autorização. Eventos de `SlotReleaseEvent` são duráveis, mas ainda não consumidos até BE-024. Regressão completa até BE-023 em execução. Próximo: fila/oferta/expiração/aceite e encaixe, usando P-28 como produtor de oportunidades.

## Preparação da próxima spec (ainda não implementada)

- BE-024 foi lida integralmente (38 linhas); RF-012 exige fila `queuedAt,id`, preferências, oferta/hold com `waitlist.offer_ttl_minutes`, expiração seguida do próximo elegível, aceite com consentimento/representação/RN-003 e encaixe só recepção/gestor fora da grade sem sobreposição.
- Antes do código, completar no contrato os formatos de `timePreferences` e o tipo de visita da entrada de espera: os campos atuais não distinguem duração de primeira consulta/retorno. Identificar qualquer default como decisão técnica, não requisito original.
- Consumir `SlotReleaseEvent` de cancelamento/remarcação com revalidação da vaga; reserva `held` é criada/confirmada pela mesma barreira BE-020. Fila/oferta/hold, notificações e auditoria precisam compartilhar a unidade de trabalho; trabalhador usa relógio injetável e testes de TTL/corrida.
- Evitar reofertar a mesma vaga indefinidamente à primeira entrada após expiração: rastrear ofertas anteriores por oportunidade; a entrada pode continuar interessada em outras oportunidades. Registrar a política técnica antes da implementação.
- Se acrescentar FK de `SlotReservation.offerId` ao novo modelo, atualizar fixtures que ainda usam UUIDs de oferta sem entidade (`reservations.test.ts`, catálogo/disponibilidade e booking). Manter constraints fortes e transações completas; não repetir a regressão de FK de BE-021.
- BE-025 (39 linhas lidas integralmente) integra as novas versões a jobs persistidos de lembrete; preservar o teto Q-16 de dois envios bem-sucedidos por consulta e revalidar versão/status/consentimento antes da entrega. Não declarar lembretes operacionais antes dessa spec.
- Ainda faltam BE-024–029 e FE-010–020; implementar uma spec por vez. O objetivo continua M1 completo; não iniciar M2.

## Fechamento local até BE-023 — 05/11/2026

**Regressão completa: 61/61 integrações backend, 25/25 testes Node e 2/2 Vitest aprovados; lint backend em 162 arquivos aprovado.** Nenhum `tsc`. BE-016–023 estão implementadas no escopo local, com extensões explicitadas para BE-024/025/051 e front. Permanecem BE-024–029 e FE-010–020; M1 não está concluído. PostgreSQL descartável permanece ativo para a continuação. Nenhum dado real foi usado.

## Fechamento local BE-024 — 05/11/2026

Entrada/listagem/saída, FIFO por oportunidade, expiração/avanço, aceite com o mesmo hold e encaixe justificado estão implementados. P-29 completa o contrato técnico; worker persistido e encerramento gracioso estão ativos no runtime. O SQL valida entrada/oferta/reserva ao commit, sem apagar histórico. Oferta aceita preserva histórico após cancelamento posterior da consulta. Contato assistido mantém pacientes sem conta digital ativa ou com suspensão online na fila; consentimento revogado continua bloqueando envio/aceite.

Bateria final de espera: 17/17 integrações, incluindo 12 inscrições simultâneas sem esgotar o pool e oportunidade tomada antes do consumidor sem oferta falsa. A revisão compartilhou o adapter de disponibilidade com a transação já aberta; não há transação aninhada durante inscrição. `bookingTransaction`/`bookingUnitOfWork` são reutilizados para reserva, consulta e espera. Primeiro checkpoint teve 76/76; **estado final: 78/78 integrações backend, 25/25 Node, 2/2 Vitest e lint backend em 172 arquivos aprovados**. Nenhum `tsc`. Node 22.22.0 e PostgreSQL 17 isolado; sem dados reais.

M1 ainda não concluído: faltam BE-025–029 e FE-010–020. Próxima spec: BE-025; fonte inicial já lida integralmente (39 linhas), mas reler seção DRS RF-013 e contratos antes de definir os jobs. O container de teste permanece ativo.

### Pontos de integração para BE-025 (planejamento, não implementado)

- Jobs persistidos por consulta/versão e instante de `reminder.schedule_hours_before`, teto de dois lembretes bem-sucedidos por consulta, com reprogramação/invalidação em confirmação/remarcação/cancelamento. Definir no contrato a contagem para responsável com múltiplos destinatários e para novas versões; não presumir limite reiniciado a cada remarcação.
- M0 já oferece outbox, retry, preferência/canal no envio, caixa dev e método `DispatchNotifications.deliver(id)`. Revalidar versão/status/consentimento antes do envio e impedir lembrete de horário antigo, inclusive sob corrida com alteração da consulta.
- Não usar `payloadEncrypted` de lembrete como token de recuperação: hoje o dispatcher interpreta conteúdo cifrado como token. Payload de agenda deve ter contrato próprio, contendo apenas informações administrativas mínimas, sem dados clínicos; endereço real da clínica ainda não foi fornecido e precisa constar como pendência/parâmetro, nunca ser inventado.
- Publicação de convite/reset e aviso de oferta não devem mudar. Novos jobs do CSV devem respeitar Q-19 (importação não dispara notificações). M3 não está autorizado como parte do M1; não simular sala/preparo de vídeo operacional.


## Fechamento local BE-025 — 12/11/2026

Jobs por consulta/versão/antecedência são persistidos junto à confirmação/remarcação; cancelamento invalida o planejamento. Reconciliação e worker retomam sem duplicação. Dispatcher revalida consentimento, preferências e destinatário, serializa alteração de consulta e preserva o teto de dois eventos bem-sucedidos por consulta mesmo após remarcações. Conteúdo administrativo cifrado é renderizado como mensagem, separado de tokens de identidade. Fallback/falha sinaliza atenção à recepção. Resposta `confirm/cannot_attend` preserva histórico append-only com sequência monotônica, não muda check-in nem libera reserva; cancelamento efetivo mantém a oportunidade de BE-024. Listagem própria retorna declaração da versão atual.

**13/13 integrações específicas; regressão completa 91/91 integrações, 25/25 Node, 2/2 Vitest e lint backend em 180 arquivos aprovados; nenhum tsc.** Logs em `/tmp/vidaplena-be025-*.log`. Primeiro checkpoint 10/11 teve apenas expectativa 403 incompatível com a invalidação prévia de sessão (401) após revogação; corrigida e regressão refeita. Testes genéricos M0 do dispatcher usam aviso essencial sem simular lembrete desacoplado de consulta/job.

Container antigo não existia na retomada. Novo PostgreSQL 17 descartável `vp-m1-postgres-test` está em `127.0.0.1:32768`, banco `vidaplena_m1_test`, trust local; URL `postgresql://postgres@127.0.0.1:32768/vidaplena_m1_test`. Base sem usuários foi recriada durante ajuste da migration ainda não commitada; todos os testes usam dados fictícios e bancos isolados. Node 22.22.0 é necessário. A pedido do usuário, **não criar commits**; ao terminar/atingir limite, gerar somente mensagem de commit sugerida. HEAD continua `0db50bd`.

M1 permanece incompleto: faltam BE-026–029 e FE-010–020. Próxima spec BE-026; não iniciar M2.


## BE-026 e revisão final do dispatcher — 12/11/2026

Check-in presencial imutável por versão, status/histórico/reserva/auditoria/avisos transacionais, agenda administrativa paginada e fila própria estão implementados. **9/9 integrações específicas aprovadas**. Extensão P-31 permite apenas remarcação assistida justificada de espera do dia atual, preservando chegada anterior e criando novo ciclo `confirmed`. Não concede remarcação de espera pelo portal, reabertura de dia anterior ou acesso clínico. Spec BE-026 foi lida integralmente (38 linhas originais); DRS RF-014, modelo/contratos/parâmetro e política de acesso (45 linhas) conferidos do início ao fim.

Checkpoint completo de **100/100 integrações, 25/25 Node, 2/2 Vitest e lint em 188 arquivos**. Revisão posterior encontrou dispatcher escolhendo e-mail mesmo sem adaptador ativo; corrigido para fallback portal/atenção e teste acrescido (agora 14 testes BE-025). A seleção explícita de e-mail para confirmar contato também passa a exigir consentimento permitido; teste real de paciente revogado cobre a exceção. Regressão final em andamento: `/tmp/vidaplena-be026-final-integration.log`, sessão exec `28297`. Não reiniciar sem consultar o handle/processo. Lint/Node/Vitest finais já passaram nos arquivos `-final-*`. Nenhum commit criado; HEAD `0db50bd`.

M1 segue incompleto: faltam BE-027–029 e FE-010–020. BE-027 lida integralmente (38 linhas), ainda não implementada: registrar ausência manual após parâmetro, três injustificadas em 12 meses suspendem somente portal, correção auditada recalcula e virada de janela reverte suspensão. Antes de código, reler RN-006/DRS RF-015 e decidir no contrato a expiração derivada da janela, sem inventar suspensão fixa. Continuar uma spec por vez e sem commits; gerar mensagem de commit ao encerrar/atingir limite.


## Fechamento verificado BE-025/026 — 12/11/2026

A sessão `28297` terminou com exit 0: **101/101 integrações backend**, incluindo 14 de lembretes e 9 de check-in. Logs finais `/tmp/vidaplena-be026-final-integration.log`, `-unit.log` (25/25), `-vitest.log` (2/2), `-lint.log` (188 arquivos). Nenhum `tsc`; `git diff --check` aprovado. Os avisos intencionais de rollback em testes foram sanitizados; não são falhas da suíte. Esta evidência substitui os checkpoints de 91/100 e a revalidação pendente acima.

BE-025 e BE-026 estão concluídas no escopo local; a revisão corrigiu canal desativado e a exceção de verificação de contato após revogação, com teste real. Matriz, ordem, specs e P-30/P-31 atualizados. **M1 não está concluído: faltam BE-027–029 e FE-010–020.** Próxima ação: BE-027 (38 linhas já lidas; reler DRS/RN-006/contratos antes de código). Não iniciar M2.

**Não criar commits:** instrução mais recente do usuário. HEAD permanece `0db50bd`, índice vazio e alterações disponíveis no worktree. Mensagem sugerida ao encerrar deve cobrir lembretes/respostas/check-in/agenda e testes; não declarar M1 completo. PostgreSQL descartável continua ativo em `127.0.0.1:32768`; confirmar estado/porta na retomada. Não há processos de teste ativos após este fechamento.


## Fechamento verificado BE-027 — 12/11/2026

Implementados registro/correção de ausência, origem e revisões imutáveis, justificativa cifrada, conferência na agenda, encerramento de ocupação com reserva histórica preservada e política dinâmica RN-006. P-32 define deadline a partir do início por Q-16, expiração no aniversário de 12 meses no fuso, estado/cache e aviso dirigido à recepção. Não há marcação automática ou punição fixa; sem exclusão, cancelamento retroativo ou oferta de ausência. Portal/aceite da espera consultam fatos atuais; correção, expiração e papéis/consentimento são revalidados no envio de aviso. As duas fixtures anteriores de suspensão manual foram substituídas por fatos históricos consistentes de ausência; não preservar campo/cache como autoridade paralela.

**10/10 integrações BE-027 e teste de calendário 1/1 aprovados; consumidores de confirmação/check-in/espera 35/35. Regressão final: 111/111 integrações backend, 26/26 Node, 2/2 Vitest, lint em 198 arquivos e `git diff --check` aprovados; nenhum tsc.** Sessão de regressão `19387` terminou exit 0. Logs `/tmp/vidaplena-be027-{full-integration,unit,vitest,lint,absence-final,consumers}.log`. Instalação local mantém Node 22.22.0 e PostgreSQL 17 descartável `vp-m1-postgres-test`, porta 32768, base `vidaplena_m1_test`; confirmar container/porta antes de usar. Nenhum teste ficou em execução no fechamento.

Constituição (48 linhas), visão geral (47), ordem (145), matriz então com 185 e spec BE-027 original (38) lidas de início ao fim, além de RF-015/RN-006 e seções compartilhadas indicadas. `booking-store.ts` então com 378 linhas foi lido em blocos sequenciais até o fim. Fonte da janela permanece DRS; escolhas de borda estão identificadas em P-32 e aguardam clínica, sem presumir parecer jurídico P-01.

**Próxima spec: BE-028**, lida integralmente (38 linhas); `shared/import-templates.md` tem 40 linhas e ainda precisa ser lido, junto aos contratos/modelo/decisão Q-19, antes de implementar. CSV é demonstrativo, preview não grava pacientes, confirmação revalida e importa linhas aptas, rejeita duplicidades de CPF, reimportação idempotente por chave externa; sem criar User/consentimento/notificações. BE-029 e FE-010–020 também permanecem pendentes. M1 não está concluído; não iniciar M2.

Última instrução continua: **não criar commits**, apenas mensagem sugerida ao encerrar/atingir limite. HEAD segue `0db50bd`; mudanças acumuladas desde esse commit abrangem BE-025/026/027 e ficam no worktree. Não repetir verificações já concluídas sem nova mudança/falha; nenhuma execução de `tsc` autorizada.
