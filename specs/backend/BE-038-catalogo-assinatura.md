# BE-038 - Catálogo documental e SignatureProvider

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-013, BE-034, BE-004
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
- [ ] Dado tipo clínico padrão, quando consultar, então nível exigido é qualificada; declaração de comparecimento exige simples até configuração auditada diversa.
- [ ] Dado ambiente dev, quando simular emissão, então evidência contém SHA-256/signatário/UTC/versão e selo sem validade; `issued_valid` não é retornado.
- [ ] Dado ambiente produção com DevSignatureProvider, quando iniciar, então bootstrap recusa; sem provider real exigido, `issue` não emite documento válido.
- [ ] Dado documento emitido, quando tentar alterar bytes ou baixar código público, então edição falha e verificação não expõe conteúdo clínico.

## 6. Testes esperados
Catálogo/defaults/versionamento, provider fake/dev, bloqueio prod, hash, imutabilidade, anulação e verificação pública sem conteúdo; lint.

## 7. Definition of Done
- [ ] Porta/adapters isolados e status jurídico distinto; nenhum certificado falso.
- [ ] Testes/lint passam; RN-009/RNF-017 mantidos parciais até P-02, sem `tsc`.

## 8. Suposições e pontos em aberto
Lista definitiva de níveis por tipo, regra por conselho e integração ICP-Brasil dependem de jurídico/P-02. Não declarar validade clínica de emissão dev.
