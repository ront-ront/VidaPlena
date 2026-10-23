# FE-036 - Relatórios e exportação

- **Software:** front
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** FE-035, BE-049
- **Requisitos cobertos:** RF-031, RNF-021

## 1. Objetivo
Permitir selecionar relatório/filtros, examinar prévia e obter exportação síncrona ou assíncrona com confirmação de tratamento pessoal.

## 2. Escopo
- Inclui catálogo, formulário, ciência, job, aviso de pronto e download. NÃO inclui auditoria exportável (FE-037).

## 3. Contexto necessário
Ler DRS §3.5.4/§4.6.2, Q-16/Q-18, shared/api-contracts.md#m4 (reports), shared/parameters.md (report.sync_*), frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14 em /gestao/relatorios: tipo, período/filtros, indicador de dado pessoal, checkbox de ciência quando exigido, botão Gerar, prévia paginada, estado job e download. UI não decide sync/async localmente: usa mode da API; ao retornar 202 mostra fila/status e notificação no portal/e-mail ativo. Ao timeout convertido em job, mantém único protocolo. Erros de filtro/permissão, arquivo expirado e falha de job são específicos, com novo link autenticado quando permitido. CSV proposto P-14; leitura por teclado e cabeçalhos acessíveis.

## 5. Critérios de aceite
- [ ] Dado relatório pessoal sem ciência, quando gerar, então ação é bloqueada/409.
- [ ] Dado volume que excede report.sync_max_rows ou report.sync_timeout_seconds, quando gerar, então interface mostra job e aviso de pronto.
- [ ] Dado link expirado, quando baixar, então novo link é solicitado com permissão.
- [ ] Dado solicitante diferente, quando consultar job, então nenhum dado aparece.

## 6. Testes esperados
Formulário, ciência, sync/async, timeout, notificação, download expirado, permissão e estados; lint.

## 7. Definition of Done
- [ ] Contrato/escopo e auditoria respeitados; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Formato/tipos definitivos pendem P-14.
