# FE-020 - Prévia e confirmação do CSV de agenda

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; dados reais/corte e homologação manual pendentes
- **Depende de:** FE-015, FE-019, BE-029
- **Requisitos cobertos:** RF-007, RF-008, RNF-021

## 1. Objetivo
Importar agenda fictícia com revisão de referências e conflitos de sala/profissional antes de confirmar cada linha apta.

## 2. Escopo
- Inclui: `/importacoes/agenda`, upload/preview/confirm/relatório e ligação ao dia da agenda FE-015.
- NÃO inclui: importação de pacientes (FE-019), edição automática de registros existentes ou dupla reserva.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (importações), `specs/frontend/design-system.md`, `specs/shared/import-templates.md` (agenda), `specs/shared/api-contracts.md#m1` (imports), DRS §2.6/§3.2.3 e Q-19.

## 4. Detalhamento
- Layout proposto Q-14 reutiliza estrutura FE-019: instrução de colunas, CSV, prévia com linha/paciente/profissional/sala/horário/status e motivo de rejeição, contagens, confirmação e relatório final. Colisão `SLOT_UNAVAILABLE` é explicada como intervalo já ocupado, com rota para agenda do dia; linha rejeitada não aparece como consulta.
- Presencial exige sala referenciada, remoto não; confirmação não dispara lembrete/conta. Reimportação mostra alvo anterior sem duplicar. Origem “Histórico importado”/data/importador aparecem no detalhe da agenda.
- Loading/vazio/erro de arquivo/confirmação parcial/sucesso, permissão e tabela responsiva; nenhum conteúdo clínico em prévia.

## 5. Critérios de aceite
- [x] Dado cabeçalho ou referência inválida, quando pré-visualizar, então motivo por linha/arquivo aparece e nenhuma consulta é mostrada como importada antes do confirm.
- [x] Dada colisão de profissional ou sala, quando confirmar, então linha é rejeitada, outra apta pode entrar, e UI não mostra dupla reserva.
- [x] Dado mesmo lote reimportado, quando confirmar, então relatório apresenta zero novas consultas e zero notificações disparadas.
- [x] Dado registro importado aberto na agenda, quando visualizar, então origem/data/importador estão identificados.

## 6. Testes esperados
Layout, referências, conflito parcial, idempotência, ausência de notificação, estado de origem e autorização; lint.

## 7. Definition of Done
- [x] Reutiliza componentes FE-019 e contrato único, sem regra de reserva local.
- [x] Testes/lint passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Dados são fictícios na V1; formato real e data de corte aguardam P-07.

## Evidência local — 24/11/2026

10 casos específicos FE-020 e9 FE-019 passaram juntos:19/19 Firefox com APIs simuladas. Projeção BE-029/P-55 passou14/14 integrações HTTP/PostgreSQL reais. Painel CsvImport compartilhado, validação Zod/kind, CPF mascarado/referências, fuso da clínica, revisão antes de confirmar, conflito parcial por linha, replay, retomada após500 com mesma chave, consulta de lote próprio,403/404,360px/teclado e ligação `/agenda?date` verificados. Detalhe identifica origem/importação/importador; nenhum dado clínico ou regra de reserva no front.

Revisão visual360px ajustou largura mínima da tabela/rolagem de teclado e espaço nas contagens; lint100 arquivos aprovados. Regressão integral está em execução em `/tmp/vidaplena-m1-final-browser.log`; o resultado19/19 é anterior a esse ajuste visual. Sem tsc/commit. Produção/dados reais e leitor de tela manual permanecem pendentes.

**Auditoria final M1:** regressão124/124 Firefox e revisão posterior52/52 (FE-01811, FE-0199, FE-02010, termos22), backend160/160 com saída0, cliente7/7, nonce3/3, fuso3/3, lint e build aprovados. Resultados sobrepostos não devem ser somados como uma única execução. FE-018 restringe decisões de atraso à recepção em atendimento aguardando. Evidências e limites em `../_work/11-m1-completion-audit.md`.
