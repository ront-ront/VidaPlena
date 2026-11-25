# BE-039 - Prescrição e verificação de alergia

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** backend demonstrativo implementado/verificado; publicação/visualização do paciente integra BE-043/FE-027, P-02/P-13 bloqueiam emissão clínica real
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
- [x] Dada alergia associada ao item, quando emitir sem ciência explícita, então 409 e draft persiste; com ciência auditada, segue apenas se provider exigido disponível.
- [x] Dado provider qualificado ausente em produção, quando emitir, então documento segue draft sem aparência de receita válida.
- [x] Dada prescrição anterior reutilizada, quando editar novo draft, então original/hash permanecem idênticos.
- [ ] Dada emissão/anulação dev, quando paciente visualizar, então selo “sem validade jurídica” e status/anulação aparecem.

## 6. Testes esperados
Busca/versão, campos, alergia/ciência, reuso, bloqueio controlados/P-13, assinatura dev/prod, imutabilidade/anulação e autorização; lint.

## 7. Definition of Done
- [ ] Catálogo de medicamentos aprovado antes de emissão clínica real; nenhuma prescrição sem assinatura exigida válida em produção.
- [x] Testes/lint passam; provider dev rotulado, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte de medicamentos, regra de controlados e reconhecimento de substâncias são P-13. Regras de conselho/ICP-Brasil são P-02.

## Evidência local —25/11/2026

Dataset sintético/CLI versionados, busca por nome/substância, snapshots cifrados e catálogo imutável; controlado identificado é recusado, manual sem classificação só simula em dev/test. Criação/PATCH/reuso para novo draft, ciência por alerta/versão/autor, confirmação revalidada no mesmo lock do paciente e versão de medicamentos estabilizada por lock compartilhado. Emissão dev registra evento/auditoria e congela JSON v2 com arquivos/cópia/ciências; leitura v1 compatível.

PDF real com pdf-lib/fontkit/Noto Sans OFL, selado em cada página, guardado cifrado e validado pelo scanner configurado. Arquivo/metadados/ciência/timeline pertencem à transação de emissão, com remoção do provisório em falha; descarte verifica metadados externos para preservar arquivo caso um commit tenha sido confirmado no banco e a confirmação de rede se perca. Download revalida vínculo/urgência e integridade, audita e respeita expiração. Nenhum código público fornece conteúdo do paciente.

14/14 específicos (`/tmp/vidaplena-be039-final-integration.log`, sessão39849),110/110 regressão BE-030–039 (`/tmp/vidaplena-be039-regression.log`, sessão36143),4/4 arquivos/consentimento M0 em base isolada (`/tmp/vidaplena-be039-m0-files-consent.log`, sessão38741),31/31 Node,2/2 Vitest e lint314, Prisma validate/generate/diff aprovados. Conjuntos sobrepostos. Revisão PDF com dados fictícios:22 páginas, selo/identificação em todas,30 marcadores finais preservados; extração pdftotext e primeira página conferida visualmente (artefatos `/tmp/vidaplena-be039-review-a.*`). Não é ensaio de carga/homologação clínica.

Primeiro DoD continua como portão jurídico/terminológico P-13 antes de emissão real; não afirma aprovação inexistente. Último aceite de paciente permanece aberto até BE-043/FE-027. Nenhum tsc ou mudança no banco de desenvolvimento.
