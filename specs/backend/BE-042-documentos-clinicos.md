# BE-042 - Atestados e demais documentos clínicos

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** implementada localmente; validações P-02 pré-produção pendentes
- **Depende de:** BE-038, BE-036
- **Requisitos cobertos:** RF-021, RN-009, RN-012

## 1. Objetivo
Criar, assinar, arquivar e verificar atestados, declarações, relatórios e encaminhamentos com nível por tipo e histórico de anulação.

## 2. Escopo
- Inclui: modelos versionados, preenchimento com paciente/atendimento, emissão pelo SignatureProvider, código público e anulação/nova emissão.
- NÃO inclui: prescrição (BE-039), pedido de exame (BE-040) ou validade jurídica com provider dev.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m2` (documentos), `specs/shared/data-model.md#m2`, `specs/shared/business-rules.md` RN-009/012, DRS §3.3.6 e Q-10/P-02.

## 4. Detalhamento
- Profissional autorizado seleciona tipo, recebe modelo com dados mínimos do paciente/atendimento e complementa conteúdo. `DocumentType` define assinatura; declaração de comparecimento simples por padrão, demais tipos clínicos qualificada. Versionar modelo/conteúdo e congelar após emissão.
- Sem provider do nível exigido, manter draft. Dev gera `issued_dev` selado sem validade; produção bloqueia DevSignatureProvider e só emite após provider real. Código público verifica status/hash/emitente sem mostrar corpo, CPF completo ou anexo.
- Correção exige novo documento e anulação justificada do antigo, mantendo ambos imutáveis e retidos por `privacy.clinical_retention_years`. Publicação ao paciente passa por BE-043.

## 5. Critérios de aceite
- [x] Dado tipo clínico sem assinatura exigida disponível, quando emitir, então fica draft sem documento válido.
- [x] Dada declaração de comparecimento, quando consultar tipo, então nível padrão simples é mostrado; mudança futura não reescreve documento emitido.
- [x] Dado documento emitido, quando tentar editar/deletar, então falha; anulação registra motivo e substituto sem remover original.
- [x] Dado código público, quando verificar, então retorna apenas metadados seguros, inclusive selo dev quando aplicável.

## 6. Testes esperados
Tipos/modelos, níveis, draft/provider, verificação sem vazamento, imutabilidade, anulação e retenção; lint.

## 7. Definition of Done
- [x] Fluxo de emissão respeita catálogo/porta única; selo jurídico correto.
- [x] Testes/lint passam; conformidade ICP-Brasil pendente P-02, sem `tsc`.

## 8. Suposições e pontos em aberto
Modelos clínicos reais, conselho profissional e níveis finais de assinatura aguardam responsável técnico/jurídico P-02; não incluir texto clínico padrão inventado.

Evidências em26/11/2026:9/9 integrações específicas;13/13 revisão BE-038 e47/47 consumidores clínicos na regressão,31/31 Node,2/2 Vitest e lint335. PDF de6 páginas com180 linhas, identificação/selo em cada página e revisão visual da primeira. A primeira regressão59/60 tinha expectativa histórica de policy ausente, corrigida e revalidada no lote13/13; não declarar nova execução única60/60. Contrato P-69 e detalhes em `../_work/12-m2-implementation-progress.md`.
