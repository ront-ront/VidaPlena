# BE-040 - Pedidos de exames assinados

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-038, BE-034, BE-036
- **Requisitos cobertos:** RF-020, RN-009

## 1. Objetivo
Registrar solicitação de exame com indicação clínica, TUSS quando aplicável e documento assinado conforme o catálogo.

## 2. Escopo
- Inclui: `ExamOrder`, draft/pedido, código/descrição TUSS, assinatura, arquivo imutável e alerta de pendência.
- NÃO inclui: upload de resultado (BE-041), integração com laboratório/guia TISS ou emissão válida sem provider real.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m2` (exames/documentos), `specs/shared/data-model.md#m2`, `specs/shared/parameters.md` (`exam.pending_result_alert_days`), DRS §3.3.5 e Q-08/Q-10.

## 4. Detalhamento
- Profissional com atendimento informa exame, indicação e código/descrição TUSS local quando aplicável; particular pode omitir TUSS. `ClinicalDocument` tipo pedido de exame herda nível de assinatura do catálogo e congela payload/versão ao emitir.
- Sem assinatura exigida, draft não é pedido válido. Dev emite somente `issued_dev` com selo; produção exige provider conforme P-02. Pedido emitido vincula-se a prontuário/atendimento e é publicado ao paciente pela política BE-043, sem expor indicação interna se não aprovada.
- Pedido sem resultado além de `exam.pending_result_alert_days` aparece na fila do solicitante; alerta não inventa resultado nem envia conteúdo clínico à recepção.

## 5. Critérios de aceite
- [ ] Dado pedido particular sem TUSS, quando rascunhar, então é aceito; código TUSS informado inválido recebe 400.
- [ ] Dado provider exigido ausente, quando emitir, então draft permanece e nenhum documento válido é publicado.
- [ ] Dado pedido sem resultado após `exam.pending_result_alert_days`, quando consultar pendências, então alerta aparece somente ao profissional autorizado.
- [ ] Dado pedido emitido, quando alterar catálogo, então documento conserva código/descrição/versão originais.

## 6. Testes esperados
TUSS opcional/validação, assinatura, imutabilidade, vínculo clínico, pendência com relógio e projeção autorizada; lint.

## 7. Definition of Done
- [ ] Pedido/arquivo referenciam assinatura e atendimento; sem endpoint TISS/laboratório.
- [ ] Testes/lint passam; validade legal parcial declarada, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte TUSS P-13 e nível final de assinatura P-02 precisam de validação antes de produção.
