# BE-034 - Catálogos locais CID-10 e TUSS

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** catálogo/loader/snapshot demonstrativos implementados e verificados localmente; persistência clínica integra BE-035/040 e dados reais dependem P-13
- **Depende de:** BE-002, BE-003, BE-004, BE-030
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
- [x] Dada busca sem resultado, quando consultar, então coleção vazia sem inventar código; nenhuma rota FHIR/TISS operacional é exposta.

## 6. Testes esperados
Carga versionada/idempotente, busca, código inválido, snapshot após atualização, permissão e contrato; lint.

## 7. Definition of Done
- [x] Fonte/versão/licença dos dados demonstrativos registradas conforme orientação P-13; migrations/loader locais. Aprovação de fonte oficial permanece pendente para produção.
- [x] Testes/lint passam; interoperabilidade tratada como estrutural, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte/licença e versão dos datasets oficiais ainda não foram especificadas; registrar em P-13 antes de carregar catálogo real.

## Evidência local —25/11/2026

Catálogos e entradas versionados imutáveis, seleção ativa atômica, loader CLI e schemas Zod, busca SQL com normalização/cursor e snapshot congelado. Fixtures sintéticas DEV-CID/DEV-TUSS (29 linhas cada) usam licença do repositório e informam source/demo; não são códigos médicos oficiais. CLI lê arquivos locais, é idempotente e bloqueado em staging/production. Busca e resolução também recusam catálogo demo nesses ambientes. Nenhuma consulta externa ou interface FHIR/TISS.

49/49 integrações BE-030–034 (`/tmp/vidaplena-be034-regression.log`, sessão35455, saída0),28/28 Node (`/tmp/vidaplena-be034-node.log`, sessão4245),2/2 Vitest (`/tmp/vidaplena-be034-vitest.log`, sessão92288) e lint260 incluindo fixtures/manifest aprovados. Prisma validate/generate e diff aprovados. CLI inicialmente falhou com configuração local misturada ao ambiente do teste; teste passou a usar DOTENV_CONFIG_PATH=/dev/null e configuração explícita, sem ler o .env privado. Diagnóstico da CLI expõe apenas código/nomes de campos, sem valores.

Os três primeiros aceites ficam abertos na parte de persistência/leitura do diagnóstico/procedimento concreto até BE-035/040. Helper de snapshot/versão/invalidade e TUSS opcional foi testado em transação real; não confundir esse teste com gravação clínica já implementada. P-13 oficial permanece pendente. Dependências BE-004/030 explicitadas para reuso do escopo de identidade/perfil/auditoria, sem exigir vínculo de paciente para catálogo público aos profissionais.
