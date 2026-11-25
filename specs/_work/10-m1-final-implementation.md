# Retomada para concluir M1 — 24/11/2026

**Estado atual: implementação local M1 concluída e verificada.** Registros abaixo são checkpoints históricos. Resultado final e pendências de homologação em `11-m1-completion-audit.md`.

Pedido atual revoga a pausa após FE-017: concluir FE-018, FE-019 e FE-020, uma spec por vez, sem iniciar M2. Repositório limpo em376acba após oito commits autorizados anteriormente. Não inferir autorização para novos commits nesta implementação.

Constituição48 e specs originais FE-01839/FE-01938/FE-02038 lidas integralmente. Código OperationalAgenda852 linhas lido em blocos; contratos operacionais BE-026/027 e compartilhados consultados diretamente. Nova execução de testes será necessária; resultados anteriores não bastam para concluir M1.

## Próxima entrega: FE-018

Integrar ações à agenda, usando noShowEligible, versões e flags do servidor. Não copiar números dos parâmetros de atraso/ausência. Check-in é recepção; correção de ausência permite recepção/gestor. Admin permanece leitor. Nenhuma ausência automática ou acesso clínico.

Histórico completo de revisões ainda não tem endpoint de leitura: verificar complemento de contrato BE-027 antes de declarar esse requisito concluído. A projeção atual contém somente última classificação/versão/datas. Não simular histórico no front.

## Pendentes

- FE-018: serviço e painel em implementação; testes/documentação ainda pendentes.
- FE-019: não iniciada.
- FE-020: não iniciada.
- Auditoria final M1, rastreabilidade, testes e lint do escopo versionado (evitar caixa de e-mail local ignorada pelo Git).

## Complemento BE-027/P-53 em verificação

Adicionado GET `/appointments/{id}/absence/history` com schema Zod/OpenAPI, use case, porta e adapter Prisma. Retorna revisões/justificativas administrativas para recepção/gestor com MFA, descifra somente na leitura autorizada e audita por paciente; exclui actorId/ciphertext. Sem migração. Nova integração no arquivo absence.test.ts valida ordem, correção, papéis, 401/403/404, cache, auditoria e cifragem. Não declarar dependência concluída até verificar execução.

Container anterior estava ausente (docker ps confirmou). Criado PostgreSQL17 descartável `vp-m1-postgres-test`,127.0.0.1:32768,base controlevidaplena_m1_test. Teste cria/migra/remove sua base isolada. Execução `/tmp/vidaplena-absence-history-integration.log` em andamento; consultar handle retornado antes de repetir. Não usar banco de desenvolvimento.

## Checkpoint FE-018 (ainda incompleta)

Complemento P-53 passou11/11 integrações em `/tmp/vidaplena-absence-history-integration.log` (sessão41072). Depois, imports de tipos foram limpos e a revalidação de permissão do adapter passou a usar mayAccess(correct_absence), em vez de copiar papéis; repetir apenas teste relevante dessa alteração na validação final.

Criados serviços Zod `arrivals.ts` e painel `arrival-actions.tsx`, integrado aos detalhes da agenda para recepção/gestor. Check-in diário, classificação/correção e consulta de histórico com gate contra duplicidade, mensagens de resultado incerto e refresh preservando contexto. Há4 testes iniciais em `tests/e2e/arrivals.spec.ts`; execução iniciada em `/tmp/vidaplena-arrivals-browser.log`, sessão48649. Conferir processo/log antes de repetir.

**Trabalho restante da FE-018:** verificar testes e corrigir falhas; acrescentar filtro absenceEligibleOnly para conferência; decisão explícita Manter na fila no atraso; teste de gestor/correção, versão obsoleta/rede, 360px/teclado; confirmar relógio/foco e histórico. Serviço de histórico/backend deve passar lint; não marcar spec/matriz concluídas antes disso. FE-019/020 continuam não iniciadas. Goal permanece ativo e objetivo completo continua M1, não somente FE-018.

## Retomada após consulta ao Git

Índice confirmado vazio; nenhum commit criado. Objetivo completo M1 continua ativo. FE-018 fechada localmente:9/9 Firefox em `/tmp/vidaplena-arrivals-final-browser.log`,11/11 integrações finais em `/tmp/vidaplena-history-final-backend.log`. Histórico protegido/auditado P-53 e filtro/manualidade verificados. Frontend94/backend213 arquivos passaram lint naquela revisão.

FE-019 implementada em revisão: interface real em `/importacoes/pacientes`, serviço Zod, multipart, relatório400, hash/nonce, replay, consulta de lote e invalidação por arquivo/origem. Cliente HTTP7/7 passou. Primeira suíte browser6/9: três seletores genéricos encontraram também o anúncio Next; corrigidos. Reexecução9 casos em `/tmp/vidaplena-imports-patients-final.log`, sessão80553; consultar antes de repetir. Não declarar FE-019 concluída antes do resultado. Falha409 bloqueia nova confirmação daquela prévia (gerar nova prévia para reanalisar); expiração efetiva é decisão do servidor, não do relógio do cliente.

Leituras desta retomada: constituição48, overview47, frontend AGENTS76, design-system70, screens-map61, FE-01938, FE-02038, import-templates42 e Next use-client123, integralmente. Use case backend ImportAppointments640 e teste appointment-imports708 lidos sequencialmente até o fim. Nenhum tsc executado. Context7 indisponível entre ferramentas; referência Next instalada usada diretamente.

**FE-019 fechada localmente:**9/9 Firefox na reexecução final,7/7 cliente e lint98 aprovados. Prosseguir somente com FE-020; revalidar FE-019 depois da extração de componentes compartilhados.

## FE-020 local e auditoria M1 em andamento

Dependência P-55 registrada antes do código: projeção administrativa e dia/fuso da clínica em ImportReport;14/14 integrações BE-029 repetidas em `/tmp/vidaplena-agenda-import-back-final.log` (sessão33793 terminou). FE-02010 casos eFE-0199 casos passaram juntos19/19 em `/tmp/vidaplena-imports-browser.log` (66370 terminou). Extraído CsvImport comum, mantendo contrato/kind e nonce escopados. Revisão visual360px identificou compressão de coluna e espaço ausente, corrigidos; teste acrescentado para rolagem por teclado.

Regressão final frontend124 casos em `/tmp/vidaplena-m1-final-browser.log`, sessão55537; backend integral em `/tmp/vidaplena-m1-final-backend.log`, sessão93609. Banco-base de teste recebeu migrations antes da suíte; somente PostgreSQL descartável.26/26 Node e2/2 Vitest concluídos; lint backend213/front100 aprovados. Cliente/nonce/fuso em execução32668. Não encerrar goal enquanto resultados finais e documentação ainda não forem verificados. Auditoria detectou opções de atraso aparecendo em status encerrado/gestor; ajustar somente FE-018 após a execução atual terminar e acrescentar regressão pertinente. M2 permanece intocada.

## Resultado final verificado

- FE-01811/11 na revisão do atraso; FE-0199 eFE-02010 verificadas junto ao termo22 na execução posterior52/52 (`/tmp/vidaplena-m1-postbuild-browser.log`, saída0). Regressão anterior124/124 (`/tmp/vidaplena-m1-final-browser.log`), sem somar contagens sobrepostas.
- Integrações backend160/160 na primeira execução. Wrapper Yarn retornou143 depois de reportar sucesso; por isso a suíte foi repetida diretamente pelo mesmo runner Node, mesmos arquivos e concorrência1:160/160, saída0 em `/tmp/vidaplena-m1-final-backend-direct.{log,exit}`. Nenhuma falha de teste ou DB de desenvolvimento.
-26/26 Node,2/2 Vitest,7/7 cliente HTTP,3/3 nonce,3/3 fuso. Lint backend213 (`src tests`, exclui caixa ignorada de e-mail e ops não alteradas) e frontend100 aprovados. `git diff --check` sem erros.
- Build Next aprovado, saída0 (`/tmp/vidaplena-m1-final-build-recheck.{log,exit}`). Primeira tentativa encontrou callbacks de Playwright sem tipo de botão e helper de fixture `document` sombreando o global do DOM. Corrigidas apenas tipagens e nome da fixture em testes, incluindo dependência M0 consent-terms; nenhum comportamento de produto M0 alterado. Revisão posterior52/52 confirma testes alterados.
- Contratos P-53/P-55, specs FE-015/018/019/020, BE-027/029, mapa, ordem e matriz atualizados. Validador documental confirmou85 IDs do inventário/matriz,96 specs/metadados, oito seções e grafo sem ciclo; M1 tem25 specs e29 requisitos/diretrizes.

A implementação termina em M1. Ensaios com participantes/leitor de tela, carga formal e portões jurídicos/operacionais não foram executados nem declarados cumpridos. Auditoria11 registra limites por requisito. Índice Git continua vazio e não houve novos commits/staging/push nesta implementação.

Validação documental final:96 specs/IDs únicos e oito seções,25 specs M1 mapeadas na tabela implementada,85 IDs inventário/matriz e dependências topológicas conferidos. Dos157 itens de aceite/DoD,153 estão marcados e quatro critérios externos de homologação permanecem abertos, listados na auditoria11. Saídas0 de backend/build/browser conferidas no disco. Container descartável `vp-m1-postgres-test` parado após os testes; nenhum serviço de desenvolvimento alterado.
