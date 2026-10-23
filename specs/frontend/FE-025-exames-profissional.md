# FE-025 - Solicitação de exames e resultados

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, BE-040, BE-041
- **Requisitos cobertos:** RF-020, RNF-021

## 1. Objetivo
Dar ao profissional uma vista de pedidos/resultados, emissão de novo pedido e pendências sem resultado, com status de assinatura fiel.

## 2. Escopo
- Inclui: `/prontuarios/[patientId]/exames`, seleção TUSS, indicação, pedido/draft/assinatura, lista de resultados e alertas pendentes.
- NÃO inclui: upload assistido pelo paciente/recepção (FE-040), guia TISS ou integração laboratorial.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (exames), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m2` (TUSS/documents/exam-results), `specs/shared/parameters.md` (`exam.pending_result_alert_days`), DRS §3.3.5 e Q-08/Q-10.

## 4. Detalhamento
- Layout proposto Q-14: header FE-021, seção Novo pedido com busca TUSS código+descrição e indicação clínica, lista de pedidos com status de assinatura/resultado e seção de arquivos associados/externos. Atendimento particular pode omitir TUSS; texto de erro explica código inválido e campo a corrigir.
- Emissão usa BE-038/040 e exibe `issued_dev` com selo sem validade; sem provider mantém draft. Resultado associado mostra origem/data/profissional e download autenticado/auditado; pendência após `exam.pending_result_alert_days` aparece como alerta próprio, sem inventar resultado.
- Loading/vazio/erro de assinatura/arquivo e sucesso; tabela/card responsivo em tablet e teclado, alerta por texto/ícone além de cor.

## 5. Critérios de aceite
- [ ] Dado pedido particular sem TUSS, quando salvar, então não bloqueia; código informado inválido mostra erro.
- [ ] Dado provider ausente, quando emitir, então pedido permanece draft e nenhum estado válido aparece.
- [ ] Dado pedido sem resultado além de `exam.pending_result_alert_days`, quando abrir, então pendência aparece; após anexo válido, status atualiza.
- [ ] Dado resultado externo, quando listar, então origem externa é visível e download exige sessão/autorização.

## 6. Testes esperados
TUSS opcional, draft/assinatura dev, pendência por chave, resultado externo, autorização/download e estados; lint.

## 7. Definition of Done
- [ ] UI não inventa pedido válido nem guia TISS; FE-040 cobre upload de terceiros.
- [ ] Testes/lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
Catálogo TUSS e assinatura real pendem P-13/P-02; ausência de laboratório integrado é escopo Q-08.
