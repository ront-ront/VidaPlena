# FE-020 - Prévia e confirmação do CSV de agenda

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
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
- [ ] Dado cabeçalho ou referência inválida, quando pré-visualizar, então motivo por linha/arquivo aparece e nenhuma consulta é mostrada como importada antes do confirm.
- [ ] Dada colisão de profissional ou sala, quando confirmar, então linha é rejeitada, outra apta pode entrar, e UI não mostra dupla reserva.
- [ ] Dado mesmo lote reimportado, quando confirmar, então relatório apresenta zero novas consultas e zero notificações disparadas.
- [ ] Dado registro importado aberto na agenda, quando visualizar, então origem/data/importador estão identificados.

## 6. Testes esperados
Layout, referências, conflito parcial, idempotência, ausência de notificação, estado de origem e autorização; lint.

## 7. Definition of Done
- [ ] Reutiliza componentes FE-019 e contrato único, sem regra de reserva local.
- [ ] Testes/lint passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Dados são fictícios na V1; formato real e data de corte aguardam P-07.
