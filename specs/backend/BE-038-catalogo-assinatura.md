# BE-038 - Catálogo documental e SignatureProvider

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** fundação implementada/verificada localmente; prescrição BE-039 integrada; templates/políticas BE-040/042 e produção P-02 pendentes
- **Depende de:** BE-013, BE-034, BE-004, BE-032
- **Requisitos cobertos:** RN-009, RNF-017

## 1. Objetivo
Definir tipos de documento e a porta de assinatura com adaptador demonstrativo seguro contra uso em produção, mantendo conteúdo emitido imutável.

## 2. Escopo
- Inclui: `DocumentType`/`ClinicalDocument`, `SignatureProvider`, `DevSignatureProvider`, hash/verificação, níveis e bloqueio de produção.
- NÃO inclui: provedor ICP-Brasil real, templates de prescrição/exame/atestado (BE-039/040/042) ou parecer jurídico final.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2` (documentos), `specs/shared/api-contracts.md#m2` (documentos), `specs/shared/business-rules.md` RN-009, Q-10/P-02 e DRS §4.4.6.

## 4. Detalhamento
- Seed idempotente de prescrição, atestado, pedido de exame, declaração, relatório e encaminhamento. `requiredSignatureLevel` é configurável, default qualificada para documentos clínicos e simples para declaração de comparecimento; alteração versionada/auditada não retroage. Publicador/validador final pendente P-02.
- `SignatureProvider` recebe bytes canônicos, signatário/registro, nível e versão; devolve evidência. Dev gera SHA-256, signatário, UTC, versão, selo **“sem validade jurídica”**, estado `issued_dev`; bloqueio em produção no bootstrap BE-001. Sem provider do nível exigido, documento continua draft e `issue` falha; não chamar hash dev de certificado ICP-Brasil.
- Emitido congela bytes/arquivo/hash; anulação cria evento e novo documento, preservando original. Código de verificação público expõe só status/metadados seguros, sem prontuário.

## 5. Critérios de aceite
- [x] Dado tipo clínico padrão, quando consultar, então nível exigido é qualificada; declaração de comparecimento exige simples até configuração auditada diversa.
- [x] Dado ambiente dev, quando simular emissão, então evidência contém SHA-256/signatário/UTC/versão e selo sem validade; `issued_valid` não é retornado.
- [x] Dado ambiente produção com DevSignatureProvider, quando iniciar, então bootstrap recusa; sem provider real exigido, `issue` não emite documento válido.
- [x] Dado documento emitido, quando tentar alterar bytes ou baixar código público, então edição falha e verificação não expõe conteúdo clínico.

## 6. Testes esperados
Catálogo/defaults/versionamento, provider fake/dev, bloqueio prod, hash, imutabilidade, anulação e verificação pública sem conteúdo; lint.

## 7. Definition of Done
- [x] Porta/adapters isolados e status jurídico distinto; nenhum certificado falso.
- [x] Testes/lint passam; RN-009/RNF-017 mantidos parciais até P-02, sem `tsc`.

## 8. Suposições e pontos em aberto
Lista definitiva de níveis por tipo, regra por conselho e integração ICP-Brasil dependem de jurídico/P-02. Não declarar validade clínica de emissão dev.

## Evidência local —25/11/2026

Seed migratório idempotente de seis tipos e versões append-only, leitura profissional/admin e alteração só admin/MFA com auditoria/versão. Engine de drafts/emissão/anulação com payload/bytes/evidência cifrados, canonicalize5.1.0/RFC8785 e hash SHA-256; status jurídico separado. DevSignatureProvider simula nível solicitado e sela sem validade, disabled falha fechado, dev bloqueado em staging/production. Falta de policy concreta também503 sem alterar draft; schemas/templates consumidores só nas próximas specs.

Verificação pública por código aleatório/hash, auditoria e rate limit PostgreSQL parametrizado; nenhuma identificação/conteúdo do paciente. Original/arquivo emitido e evento de anulação são imutáveis no banco; substituição exige paciente/tipo/autor correspondentes. Leitura revalida integridade e autorização; urgência não abre draft nem permite emissão.

13/13 integrações específicas (`/tmp/vidaplena-be038-final-integration.log`, sessão45013),53/53 regressão clínica (`/tmp/vidaplena-be038-regression.log`, sessão66201),31/31 Node e2/2 Vitest, lint297 e Prisma validate/generate/diff aprovados. Conjuntos sobrepostos. Testes cobrem reexecução de migrate deploy sem duplicação, corrida de emissão/alteração do catálogo, rollback de auditoria e falha fechada após alteração simulada de restore. Políticas de payload fictícias existem somente no teste da fundação, sem mock clínico genérico no runtime. PDF/apresentação, regras de alergia/TUSS e publicação ao paciente seguem specs consumidoras; não declarar RN-009/RNF-017 plenamente atendidas.

**Integração BE-039:** policy e PDF concretos de prescrição registrados; engine prepara snapshots no tx, JSON v2 congela arquivos/cópia/ciência e leitor mantém v1.14/14 específicos e110/110 regressão aprovados. Demais tipos aguardam BE-040/042; P-02 continua bloqueando assinatura válida.
