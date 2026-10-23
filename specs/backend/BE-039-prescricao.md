# BE-039 - Prescrição e verificação de alergia

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-037, BE-038, BE-036
- **Requisitos cobertos:** RF-019, RN-009

## 1. Objetivo
Rascunhar prescrição estruturada, pesquisar medicamentos, verificar alergias e emitir documento sob o nível de assinatura exigido.

## 2. Escopo
- Inclui: `MedicationCatalog`/itens, busca local, reuso controlado de prescrição anterior, confirmação de alerta e emissão/anulação.
- NÃO inclui: dispensação, receituário de controlados sem regra aprovada, assinatura ICP-Brasil na V1 acadêmica.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m2` (medicamentos/documentos), `specs/shared/data-model.md#m2`, DRS §3.3.4, RN-009, Q-10 e P-02/P-13.

## 4. Detalhamento
- Profissional vinculado ao atendimento busca medicamento por nome/princípio ativo em tabela local versionada, informa dose, via, frequência, quantidade e orientações. Reusar prescrição anterior copia para **novo draft** com versão/fonte, nunca altera original.
- Antes de `issue`, confrontar princípios ativos com `ClinicalAlert` de alergia. Associação encontrada exige `acknowledgedAllergyIds` e evento de ciência; resultado sem correspondência de catálogo não garante segurança e não autoriza ignorar alerta textual. Controlados exigem regra específica P-13 antes de emissão.
- BE-038 decide status jurídico: dev pode produzir `issued_dev` com selo; produção exige assinatura qualificada real. Arquivar no prontuário, publicar ao paciente somente por projeção autorizada BE-043 e permitir verificação pública sem conteúdo.

## 5. Critérios de aceite
- [ ] Dada alergia associada ao item, quando emitir sem ciência explícita, então 409 e draft persiste; com ciência auditada, segue apenas se provider exigido disponível.
- [ ] Dado provider qualificado ausente em produção, quando emitir, então documento segue draft sem aparência de receita válida.
- [ ] Dada prescrição anterior reutilizada, quando editar novo draft, então original/hash permanecem idênticos.
- [ ] Dada emissão/anulação dev, quando paciente visualizar, então selo “sem validade jurídica” e status/anulação aparecem.

## 6. Testes esperados
Busca/versão, campos, alergia/ciência, reuso, bloqueio controlados/P-13, assinatura dev/prod, imutabilidade/anulação e autorização; lint.

## 7. Definition of Done
- [ ] Catálogo de medicamentos aprovado antes de emissão clínica real; nenhuma prescrição sem assinatura exigida válida em produção.
- [ ] Testes/lint passam; provider dev rotulado, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte de medicamentos, regra de controlados e reconhecimento de substâncias são P-13. Regras de conselho/ICP-Brasil são P-02.
