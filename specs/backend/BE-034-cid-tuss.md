# BE-034 - Catálogos locais CID-10 e TUSS

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-002, BE-003
- **Requisitos cobertos:** RF-017, RF-020, RNF-022

## 1. Objetivo
Oferecer busca local e códigos/descrições estruturados CID-10 e TUSS, preservando a versão utilizada no ato clínico.

## 2. Escopo
- Inclui: `DiagnosisCode`/`ProcedureCode`, loader de tabela local versionada, busca paginada e validação na escrita.
- NÃO inclui: endpoint FHIR, guia TISS, consulta externa ou terminologia além de CID-10/TUSS.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2`, `specs/shared/api-contracts.md#m2` (Terminologias), DRS §4.6.3/§3.3.2/§3.3.5 e Q-08.

## 4. Detalhamento
- Carregar catálogo local com `code`, `description`, `catalogVersion`, ativo; origem/versão do dataset precisam ser documentadas antes da carga. Busca por código/descrição com cursor, sem endpoint externo. Dados clínicos gravam snapshot de código+descrição+versão, não apenas FK mutável.
- Diagnóstico da evolução usa CID-10 estruturado; pedido/procedimento usa TUSS quando aplicável, opcional em atendimento particular. Valores desconhecidos/obsoletos não são aceitos silenciosamente.
- Mapas estruturais FHIR R4/TISS de `data-model.md` são referência futura; nenhuma API de integração operacional é criada.

## 5. Critérios de aceite
- [ ] Dado código CID-10 válido, quando selecionar, então código/descrição/versão são persistidos no diagnóstico.
- [ ] Dado TUSS ausente em atendimento particular, quando registrar procedimento, então fluxo permitido; código informado inválido é recusado.
- [ ] Dada atualização do catálogo, quando ler registro anterior, então descrição/versão originais continuam visíveis.
- [ ] Dada busca sem resultado, quando consultar, então coleção vazia sem inventar código; nenhuma rota FHIR/TISS operacional é exposta.

## 6. Testes esperados
Carga versionada/idempotente, busca, código inválido, snapshot após atualização, permissão e contrato; lint.

## 7. Definition of Done
- [ ] Fonte/versão do catálogo aprovadas e registradas; migrations/loader locais.
- [ ] Testes/lint passam; interoperabilidade tratada como estrutural, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte/licença e versão dos datasets oficiais ainda não foram especificadas; registrar em P-13 antes de carregar catálogo real.
