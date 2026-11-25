# FE-019 - Prévia e confirmação do CSV de pacientes

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; dados reais/corte e homologação manual pendentes
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
- [x] Dado arquivo estruturalmente inválido, quando enviar, então relatório aponta erro e botão Confirmar não fica habilitado.
- [x] Dado CPF duplicado, quando pré-visualizar, então linha/motivo aparecem e não há sucesso para ela.
- [x] Dado lote confirmado duas vezes, quando repetir, então relatório mostra zero novos pacientes.
- [x] Dado perfil sem gestão, quando forçar rota/serviço, então API nega e dados do lote não aparecem.

## 6. Testes esperados
Upload/preview, duplicidade, erro de layout, confirmação, idempotência, autorização, teclado e mensagens RNF-021; lint.

## 7. Definition of Done
- [x] Usa layout único `shared/import-templates.md`; sem CSV mockado como dado real.
- [x] Testes/lint passam; nenhum código clínico ou `tsc`.

## 8. Suposições e pontos em aberto
Fontes reais, corte definitivo e validador clínico seguem P-07; a UI marca o modo fictício de demonstração.

## Evidência local — 24/11/2026

9/9 testes Firefox com APIs simuladas (`imports-patients.spec.ts`),7/7 cliente HTTP e lint98 arquivos aprovados. Prévia real multipart/relatório400 validado por Zod; CPF mascarado, motivos por linha, confirmação com hash/nonce persistido sem CSV/dados pessoais, replay com zero novas gravações, consulta privada de lote, bloqueio após409, invalidação por arquivo/origem, erro413 e resultado incerto, admin/gestor/recepção,360px/teclado/duplo evento. Sem mocks no produto. Regras de persistência/permissão/notificação são verificadas nas integrações BE-028, repetidas na auditoria M1. Leitor de tela manual e P-07 continuam pendentes; sem tsc.

**Auditoria final M1:** regressão124/124 Firefox e revisão posterior52/52 (FE-01811, FE-0199, FE-02010, termos22), backend160/160 com saída0, cliente7/7, nonce3/3, fuso3/3, lint e build aprovados. Resultados sobrepostos não devem ser somados como uma única execução. FE-018 restringe decisões de atraso à recepção em atendimento aguardando. Evidências e limites em `../_work/11-m1-completion-audit.md`.
