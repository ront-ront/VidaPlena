# Implementação M0

Objetivo autorizado: implementar M0 em ordem, uma spec por vez, e parar antes de M1.
P-05/P-12 aprovadas pelo usuário; registro em 04-open-questions.md.

| Spec | Estado | Evidência |
| --- | --- | --- |
| BE-001 | Implementada localmente | 3 testes em tests/bootstrap.test.ts, yarn workspace vida-plena-backend test e lint aprovados; config fail-closed/CORS/close. Região real de implantação permanece pendente. |

Backend M0 concluído em implementação/ensaio local até BE-015, com BE-012/013 e homologação operacional explicitamente parciais. FE de M0 permanece pendente. Pausar agora antes do frontend, conforme pedido em 29/10/2026. Nunca executar tsc.

Direção adicional de 29/10/2026: usuário pediu análise do BarberHubAPI e adoção criteriosa de bibliotecas de API, DI, documentação e testes antes de continuar. Referência lida e registrada em `_work/04-library-adoption.md`; `docs/architecture.md` do BarberHubAPI foi lido integralmente (171 linhas). Endpoints existentes foram migrados de validação manual para schemas Zod; container TSyringe isolado e OpenAPI/Scalar dos endpoints efetivos adicionados, com testes de resolução e geração. Vitest/Supertest instalados; teste HTTP de documentação e validação 2/2 aprovado.

BE-008: autenticação interna, TOTP, JWT sem papéis/PII, cookies de refresh/CSRF, allowlist de Origin, rate limit, lock, inatividade e rotação/reuso implementados e integrados ao runtime real. Prisma migration `202610240006_auth` aplicada em banco de teste isolado; 13/13 integrações, 12/12 testes Node e 2/2 Vitest passaram. Login de paciente com consentimento ativo depende de BE-011 e permanece bloqueado por padrão; cobertura BE-008 é parcial até essa integração. O catálogo OpenAPI/Scalar foi ampliado às rotas efetivas.

BE-009: reset de senha com resposta indistinguível, limite por identificador, token de uso único e prazo, histórico de senhas, revogação de sessões, confirmação de novo e-mail e confirmação presencial de telefone. O destino pendente é cifrado na outbox sem substituir o e-mail oficial antes da prova. Migration `202610290007_recovery_contact` aplicada em banco de teste isolado; testes específicos 3/3, regressão 15/15 integrações (antes do terceiro teste de expiração), 12/12 Node, 2/2 Vitest e lint passaram. Integração de notificações do paciente fica fechada até BE-011; cobertura parcial para paciente. O contrato compartilhado de contato foi ajustado à decisão P-12.

BE-010: validação Zod de dados, CPF com dígitos verificadores, celular e idade civil parametrizada; adaptador transacional para conta adulta, dependentes e cadastro assistido, com CPF único e convite cifrado preparado. `GET /v1/me/dependents` filtra pelo usuário da sessão e audita. Nenhuma rota de escrita de cadastro foi publicada antes de BE-011. Regressão: 18/18 integrações, 13/13 Node, 2/2 Vitest e lint. Critério de ativação após consentimento permanece em BE-011. P-01 registra exceções de representação/emancipação para validação jurídica. Para dependente, contato próprio opcional usa o responsável como contato; suposição técnica até validação pela clínica.

BE-013: `FileStorage` local AES-256-GCM por categoria, `DevMalwareScanner` com MIME real e extensão/tamanho, `FileObject` com migration, quota serializada por recurso, link HMAC por sessão, download auditado e política fechada por padrão. `file-type` e Busboy instalados (Busboy reservado para multipart da BE-011). Migration `202610290008_files` aplicada no banco isolado. 19/19 integrações, 15/15 testes Node, 2/2 Vitest e lint aprovados. Upload HTTP e acesso autorizado em runtime aguardam política de consentimento/recurso BE-011; cobertura BE-013 permanece parcial.

BE-011: versões de termo e eventos append-only com ordenação determinística, cadastro digital/presencial e aceite na mesma transação, termo assinado cifrado com limpeza compensatória/reconciliação, recusa, reaceite de nova versão, revogação que invalida sessões e suprime notificações, acesso próprio/responsável a evidência e auditoria de leitura/IDOR. Migrations `202610290009_consent` a `202610300013_consent_evidence_trigger_update` aplicadas em teste. Regressão 22/22 integrações, 15/15 Node, 2/2 Vitest e lint; caso adicional de nova versão presencial aprovado 2/2 no arquivo de integração. P-01 continua portão jurídico; BE-013 mantém `POST /v1/files` genérico pendente de contexto autorizado.

BE-012: migration `202610300014_subject_requests`; pedidos de titular e dependente com prazo `privacy.subject_request_days`, fila restrita DPO/admin fallback, metadados de consentimento sem conteúdo clínico, decisão auditada, pacote M0 JSON cifrado e download apenas pelo solicitante auditado. Teste de integração dedicado 1/1 e lint. Correção encaminhada sem alegar alteração, eliminação retida até P-01; extensão da exportação aguarda módulos posteriores. A spec permanece parcial nesses pontos e no canal assistido pós-revogação.

BE-014: Pino e cliente Prometheus oficial adicionados; health e readiness PostgreSQL com timeout, logs JSON sem payload/URL concreta, métricas de latência/erro/fila/job e alertas emitidos. Registro de janelas em migration `202610300015_maintenance_windows`, 48 h/2 h parametrizáveis, sobreposição e concorrência sob lock, admin MFA e auditoria. 2/2 testes Node, 1/1 integração e lint. Prova de entrega do aviso, monitoramento externo, hospedagem brasileira e SLA mensal dependem P-07; runbook em `_work/05-operational-runbook.md`.

BE-015: pgBackRest 2.58/PostgreSQL 17 com backup completo/incremental e archive-push WAL contínuo; ciclo de arquivos cifrado com chave segregada, manifesto full/incremental, restauração autenticada e ledger de revogação. Compose de ensaio isolado, cron de exemplo, runbook e alerta estruturado de falha. Restauração local recuperou marcador após incremental via WAL, e arquivo com SHA-256 igual; 3/3 testes Node. Detalhe em `_work/06-backup-restore-evidence.md`. P-07/P-03/P-01 impedem alegar homologação real; sem schema clínico M2 não é possível testar RN-012 com prontuário. Pausa ao final do backend M0 solicitada pelo usuário.

Regressão final do backend M0 em 30/10/2026: `yarn workspace vida-plena-backend lint` aprovado (116 arquivos), `test` 20/20, `test:vitest` 2/2, `test:integration` 24/24 em PostgreSQL isolado `_test`; `git diff --check` sem erro. Nenhum `tsc` foi executado. O frontend M0 e M1–M4 não foram iniciados nesta pausa.

BE-002 concluída: migration inicial aplicada em banco vazio, 3 testes de integração PostgreSQL aprovados (concorrência/normalização/FK/dependentes/conta inativa); lint aprovado. Esqueleto de identidade e seed dos cinco papéis, sem conta admin.

BE-003 concluída: envelope único, validação, requestId, 404/409/500 sanitizado e JSON inválido; suíte Node 4/4 e lint aprovados.

BE-004 concluída: AuditWriter transacional, allowlist de metadados, triggers contra UPDATE/DELETE/TRUNCATE e retenção mínima configurável. 5 testes Node e 5 integrações aprovados; lint aprovado. WORM/conta produtiva permanecem evidências de implantação.

BE-005 concluída: guard HTTP com verificação de sessão injetada, DPO restrito, IDOR negado/auditado, concessão/revogação transacional com invalidação das sessões e último admin preservado sob concorrência. 6 testes Node e 7 integrações aprovados; lint aprovado. Composição criptográfica em BE-008.

BE-006 concluída localmente: fila PostgreSQL, deduplicação concorrente via ON CONFLICT, caixa idempotente, retry, preferências, fallback/alerta e revalidação de consentimento por porta. Testes Node 9/9; integração 8/9 na primeira execução identificou conflito de inserção duplicada, corrigido e arquivo notifications.test.ts reexecutado 2/2 com sucesso. Lint aprovado. Composição de runtime/autenticador em BE-008, consentimento de pacientes fechado até BE-011.

Correção solicitada pelo usuário: configuração de ambiente migrada para Zod 4.6.7; tipo AppConfig inferido, erros sanitizados, testes de defaults/regras/entradas inválidas aprovados. Dependência instalada com Node 22.22.0 (Node 20 recusado por dependência já existente do Prisma). `yarn.lock` registra apenas Zod adicional. Bibliotecas de apoio autorizadas pelo usuário.

BE-007 concluída localmente: seed idempotente com segredo do operador, convites atômicos com outbox, ativação/expiração/reenvio, senha bcrypt/lista comum e revisão de inatividade com alerta. 10 testes Node e 10 integrações PostgreSQL passaram; lint aprovado. Teste de provisionamento usa banco temporário isolado criado/removido por ele. Alteração de status não ativa conta antes da definição de senha. Composição de runtime permanece BE-008.
