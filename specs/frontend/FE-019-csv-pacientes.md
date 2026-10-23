# FE-019 - Prévia e confirmação do CSV de pacientes

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-009, BE-028
- **Requisitos cobertos:** RF-001, RNF-021

## 1. Objetivo
Oferecer a admin/gestor importação demonstrativa de pacientes com prévia de erros e confirmação consciente, sem criar contas automaticamente.

## 2. Escopo
- Inclui: `/importacoes/pacientes`, upload, prévia, contagens, duplicidades por CPF, confirmação e relatório final.
- NÃO inclui: agenda CSV (FE-020), prontuário/OCR ou integração legada real.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (importações), `specs/frontend/design-system.md`, `specs/shared/import-templates.md` (pacientes), `specs/shared/api-contracts.md#m1` (imports), DRS §2.6 e Q-19.

## 4. Detalhamento
- Layout proposto Q-14: cabeçalho com escopo demonstrativo, seletor CSV, instruções de cabeçalho/formato, tabela de prévia com linha/status/erro/duplicidade, cards de aceitas/rejeitadas, botão Confirmar e relatório final baixável/consultável. Nenhum botão de confirmação antes de preview válido.
- Erro estrutural explica encoding/cabeçalho e indica correção sem afirmar importação. Confirmação envia `batchId`, hash/idempotência; resultado parcial mostra linhas rejeitadas e por quê. Reimportação mostra registros já existentes e zero novas contas/avisos.
- Admin/gestor somente; dados exibidos minimizados, sem conteúdo clínico. Loading de análise, vazio, erro, preview pronto, confirmando e concluído têm estados claros em pt-BR, teclado e tabela com scroll próprio.

## 5. Critérios de aceite
- [ ] Dado arquivo estruturalmente inválido, quando enviar, então relatório aponta erro e botão Confirmar não fica habilitado.
- [ ] Dado CPF duplicado, quando pré-visualizar, então linha/motivo aparecem e não há sucesso para ela.
- [ ] Dado lote confirmado duas vezes, quando repetir, então relatório mostra zero novos pacientes.
- [ ] Dado perfil sem gestão, quando forçar rota/serviço, então API nega e dados do lote não aparecem.

## 6. Testes esperados
Upload/preview, duplicidade, erro de layout, confirmação, idempotência, autorização, teclado e mensagens RNF-021; lint.

## 7. Definition of Done
- [ ] Usa layout único `shared/import-templates.md`; sem CSV mockado como dado real.
- [ ] Testes/lint passam; nenhum código clínico ou `tsc`.

## 8. Suposições e pontos em aberto
Fontes reais, corte definitivo e validador clínico seguem P-07; a UI marca o modo fictício de demonstração.
