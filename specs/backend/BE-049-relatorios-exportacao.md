# BE-049 - Relatórios e exportação síncrona/assíncrona

- **Software:** back
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** BE-048, BE-006, BE-004
- **Requisitos cobertos:** RF-031, RNF-015

## 1. Objetivo
Gerar relatórios operacionais exportáveis, alternando para job quando limite de linhas ou tempo for excedido.

## 2. Escopo
- Inclui tipos/filtros, prévia, CSV, confirmação de ciência para dados pessoais, job e notificação. NÃO inclui prontuário clínico ou exportação de auditoria (BE-050).

## 3. Contexto necessário
Ler DRS §3.5.4, Q-16/Q-18, shared/api-contracts.md#m4, shared/parameters.md (report.sync_max_rows, report.sync_timeout_seconds, file.signed_url_ttl_seconds), backend/architecture.md e P-14.

## 4. Detalhamento
GET types define catálogo operacional versionado; POST valida gestor/admin e escopo, mede linhas/tempo e retorna sync ou job persistido em ReportJob. Acima de report.sync_max_rows ou ao exceder report.sync_timeout_seconds, enfileira uma única execução idempotente e notifica quando pronta via BE-006; sem duplicar arquivo no timeout. CSV UTF-8 proposto P-14 com escape contra fórmula de planilha, cabeçalho estável e metadados de filtro/data. Relatório com dado pessoal exige acknowledgePersonalData verdadeiro e auditoria de ator/escopo/quantidade; acesso ao arquivo só ao solicitante autorizado por link curto e download auditado. Filtrar conteúdo clínico e aplicar supressão de BE-048 em agregados.

## 5. Critérios de aceite
- [ ] Dado volume sob limites, quando emitir, então prévia e download síncronos são retornados.
- [ ] Dado volume maior que report.sync_max_rows ou tempo maior que report.sync_timeout_seconds, quando emitir, então job único é criado e aviso chega ao solicitante.
- [ ] Dado relatório pessoal sem ciência, quando emitir, então 409 e nenhum arquivo.
- [ ] Dado outro usuário, quando consultar job/link, então 404/403.
- [ ] Dado campo que começa fórmula, quando exportar CSV, então conteúdo é escapado.

## 6. Testes esperados
Limites por chave, timeout sem duplicação, CSV/injeção, autorização, ciência, notificação, download auditado; lint.

## 7. Definition of Done
- [ ] Job/arquivo e contrato versionados; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Tipos/formato finais e fórmulas pendem P-14.
