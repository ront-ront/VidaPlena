# BE-028 - Importação CSV demonstrativa de pacientes

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
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
- [ ] Dado cabeçalho/encoding inválido, quando pré-visualizar, então relatório mostra erro e zero pacientes são gravados.
- [ ] Dado CPF duplicado no arquivo/base, quando confirmar, então linha é rejeitada com motivo e paciente anterior não é sobrescrito.
- [ ] Dado mesmo lote confirmado novamente, quando reimportar, então contagem de novos pacientes é zero.
- [ ] Dado paciente importado, quando consultar, então origem/data/importador aparecem e não há conta, consentimento ou aviso criado automaticamente.

## 6. Testes esperados
Layout, UTF-8, CPF/duplicidade, preview sem writes, confirmação parcial segura, idempotência, RBAC e auditoria; lint.

## 7. Definition of Done
- [ ] Relatório reproduzível e source key única; sem histórico clínico fabricado.
- [ ] Testes/lint passam; data de corte real fica P-07, sem `tsc`.

## 8. Suposições e pontos em aberto
Existência/formato de dados legados e corte definitivo são P-07. Paciente importado sem e-mail/telefone pode permanecer cadastro administrativo incompleto para revisão assistida.
