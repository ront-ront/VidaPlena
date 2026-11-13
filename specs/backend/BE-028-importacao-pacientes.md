# BE-028 - Importação CSV demonstrativa de pacientes

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; dados reais e adendo cadastral pendentes P-01/P-07/P-33
- **Depende de:** BE-010, BE-011, BE-004
- **Requisitos cobertos:** RF-001, RF-016, RNF-016

## 1. Objetivo
Importar cadastro administrativo fictício de pacientes em duas etapas, com prévia, duplicidades, origem e reimportação idempotente, sem criar acesso digital.

## 2. Escopo
- Inclui: layout de `shared/import-templates.md`, preview, confirmação, `ImportBatch/ImportRow`, relatório e auditoria.
- NÃO inclui: prontuário/OCR, consentimento presumido, migração em massa ou importação de agenda (BE-029).

## 3. Contexto necessário
Ler `specs/shared/import-templates.md` (CSV pacientes), `specs/shared/api-contracts.md#m1` (imports), `specs/shared/data-model.md#m1`, Q-19 e `migration.cutoff_date` em `specs/shared/parameters.md`.

## 4. Detalhamento
- Admin/gestor enviam CSV UTF-8 conforme cabeçalho único; preview valida estrutura, CPF e duplicidade por CPF/base/arquivo e expõe motivo por linha **sem persistir paciente**. Confirm revalida arquivo/hash e persiste somente linhas aptas com origem/data/importador/chave externa.
- Reimportação pelo mesmo `sourceSystem+externalId`/hash retorna alvo existente sem criar duplicata. Arquivo inválido produz relatório e zero pacientes. Perfil importado não gera `User`, convite, consentimento ou notificação; portal só após fluxo explícito de aceite.
- Data anterior a `migration.cutoff_date` recebe marca de histórico importado; data de corte real pendente P-07. CSV demonstrativo usa dados fictícios, nunca supõe fonte legada existente.

## 5. Critérios de aceite
- [x] Dado cabeçalho/encoding inválido, quando pré-visualizar, então relatório mostra erro e zero pacientes são gravados.
- [x] Dado CPF duplicado no arquivo/base, quando confirmar, então linha é rejeitada com motivo e paciente anterior não é sobrescrito.
- [x] Dado mesmo lote confirmado novamente, quando reimportar, então contagem de novos pacientes é zero.
- [x] Dado paciente importado, quando consultar, então origem/data/importador aparecem e não há conta, consentimento ou aviso criado automaticamente.

## 6. Testes esperados
Layout, UTF-8, CPF/duplicidade, preview sem writes, confirmação parcial segura, idempotência, RBAC e auditoria; lint.

## 7. Definition of Done
- [x] Relatório reproduzível e source key única; sem histórico clínico fabricado.
- [x] Testes/lint passam; data de corte real fica P-07, sem `tsc`.

## 8. Suposições e pontos em aberto
Existência/formato de dados legados e corte definitivo são P-07. Paciente importado sem e-mail/telefone pode permanecer cadastro administrativo incompleto para revisão assistida.

## Evidência local — 12/11/2026

Migration `202611120028_patient_imports`, parser `csv-parse`, schemas Zod/OpenAPI, arquivo cifrado, prévia/relatório por dono e confirmação parcial transacional implementados. Origem administrativa e evidência imutáveis; sem User/consentimento/mensagem. P-33 registra data original desconhecida (`undated`), limites configuráveis e adendo cadastral ainda sem endpoint. **12/12 integrações específicas aprovadas**, incluindo lotes concorrentes e revalidação de papel/MFA; consentimento M0 revalidado 2/2 após incluir `importOrigin:null` na asserção de contrato. Node 26/26, Vitest 2/2 e lint aprovados. Regressão completa em acompanhamento no diário; sem `tsc` ou commits.
