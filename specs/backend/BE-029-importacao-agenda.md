# BE-029 - Importação CSV demonstrativa de agenda

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; fontes reais/corte pendentes P-07
- **Depende de:** BE-016, BE-017, BE-020, BE-028
- **Requisitos cobertos:** RF-007, RF-008, RN-001

## 1. Objetivo
Importar agenda fictícia com prévia e confirmação idempotente, usando a mesma barreira de profissional/sala da marcação normal.

## 2. Escopo
- Inclui: layout agenda de `shared/import-templates.md`, referências paciente/profissional/sala, colisões, relatório e origem por consulta.
- NÃO inclui: migração de prontuário, envio retroativo de confirmação/lembrete ou sobreposição autorizada.

## 3. Contexto necessário
Ler `specs/shared/import-templates.md` (CSV agenda), `specs/shared/api-contracts.md#m1` (imports), `specs/shared/data-model.md#m1`, BE-020, DRS §2.6/§3.2.3 e Q-19.

## 4. Detalhamento
- Prévia valida cabeçalho/encoding, CPF de paciente, chave externa de profissional, especialidade, sala para presencial, horários e modalidade; consulta já existente/linha duplicada é marcada. Nada de `Appointment` é gravado na prévia.
- Confirmação revalida linha e chama BE-020 para consulta ativa, com transação por linha e relatório de aceitas/rejeitadas. Estado cancelado importado conserva histórico sem hold ativo; nenhuma linha, inclusive encaixe, contorna RN-001. Reimportação não altera agendamento anterior silenciosamente.
- Cada consulta guarda origem/importador/data. Importação não cria acesso digital nem dispara aviso/lembrete, inclusive quando o horário é futuro; agendamento posterior no sistema passa a ser fonte de verdade após `migration.cutoff_date` definido.

## 5. Critérios de aceite
- [x] Dado CSV malformado, quando pré-visualizar, então relatório é produzido sem gravar consulta.
- [x] Dadas duas linhas concorrentes para mesmo profissional/sala, quando confirmar, então uma é aceita no máximo e outra rejeitada com `SLOT_UNAVAILABLE`.
- [x] Dada reimportação do mesmo lote/linha, quando confirmar, então não duplica agendamento ou notificação.
- [x] Dado agendamento importado, quando consultar agenda, então origem/data/importador aparecem; não é apresentado como evolução assinada.

## 6. Testes esperados
Referências, formatos, colisão em arquivo/base, confirmação concorrente real, idempotência, origem, ausência de aviso/conta e auditoria; lint.

## 7. Definition of Done
- [x] Usa BE-020 para reserva ativa; relatório por linha e acesso admin/gestor.
- [x] Testes/lint passam; sem migração em massa nem `tsc`.

## 8. Suposições e pontos em aberto
Data de corte real e fontes legadas permanecem P-07. Histórico clínico manual é BE-033/FE-029 e depende da resolução P-11.

## Evidência local — 12/11/2026

Migration `202611120029_appointment_imports`, contrato Zod/OpenAPI, prévia sem consulta/reserva, confirmação por linha retomável e reserva ativa via BE-020 implementados. Identidade/evidência imutáveis, histórico de estados completed/cancelled sem reserva, origem administrativa por papel e reconciliação sem lembretes. **Regressão completa 136/136 integrações**, Node 26/26, Vitest 2/2 e lint aprovados. Revisão posterior de nome de sala reutilizado: seleção prioriza cadastro ativo, **14/14 integrações BE-029** aprovadas; os 136 casos da regressão completa incluem os 13 anteriores. Lotes CSV juntos passaram 25/25 antes dessa revisão. P-34 identifica UUID demonstrativo de profissional, classificação de corte e comportamento em falha parcial; sem `tsc`, dados reais ou commits. FE-020 ainda pendente.
