# BE-040 - Pedidos de exames assinados

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** backend demonstrativo implementado e verificado; resultados BE-041/publicação BE-043 pendentes, validade jurídica P-02/P-13 antes de produção
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
- [x] Dado pedido particular sem TUSS, quando rascunhar, então é aceito; código TUSS informado inválido recebe 400.
- [x] Dado provider exigido ausente, quando emitir, então draft permanece e nenhum documento válido é publicado.
- [x] Dado pedido sem resultado após `exam.pending_result_alert_days`, quando consultar pendências, então alerta aparece somente ao profissional autorizado.
- [x] Dado pedido emitido, quando alterar catálogo, então documento conserva código/descrição/versão originais.

## 6. Testes esperados
TUSS opcional/validação, assinatura, imutabilidade, vínculo clínico, pendência com relógio e projeção autorizada; lint.

## 7. Definition of Done
- [x] Pedido/arquivo referenciam assinatura e atendimento; sem endpoint TISS/laboratório.
- [x] Testes/lint passam; validade legal parcial declarada, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte TUSS P-13 e nível final de assinatura P-02 precisam de validação antes de produção.

## Evidência local —25/11/2026

Policy de exames integrada ao engine com privateVisit explícito, indicação, snapshot TUSS resolvido no servidor e versão estabilizada por lock compartilhado. ExamOrder/PDF/timeline/auditoria emitidos atomicamente; arquivo cifrado e imutável. Alteração de catálogo não muda emitido, draft antigo exige revisão e reuso cria nova versão independente. Fila usa parâmetro, paginação e autorização antes do limite; somente solicitante, sem pré-consulta, com vínculo ou urgência vigente não rejeitada. Sem resultado fictício, integração operacional ou publicação automática.

8/8 específicos no lote17/17 com histórico (`/tmp/vidaplena-be040-resume.log`, sessão33876, saída0),4/4 arquivos/consentimento M0,31/31 Node,2/2 Vitest e lint322 aprovados. Primeira regressão completa117/118 detectou timeout em upload excessivo de histórico; corrigido no commit a07b131 e revalidado nos lotes acima, sem alegar full118/118 novo. PDF fictício de18 páginas conferido com pdftotext e imagem: selo/identificação em todas e30 exames completos, artefatos `/tmp/vidaplena-be040-review.*`. Código de pedido já incluído em689f71c; fechamento de evidência preserva esse histórico.

Recebimento/saída da fila após resultado real integra BE-041; política de indicação no portal integra BE-043. Assinatura é somente simulação dev, sem validade jurídica; catálogo oficial/provider real continuam P-13/P-02. Não houve tsc ou alteração em banco de desenvolvimento nesta retomada.
