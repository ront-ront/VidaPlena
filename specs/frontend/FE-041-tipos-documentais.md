# FE-041 - Configuração de tipos documentais

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-003, FE-004, BE-038
- **Requisitos cobertos:** RN-009, RNF-017

## 1. Objetivo
Permitir que admin configure o nível exigido por tipo clínico com trilha de alteração e alerta do portão jurídico.

## 2. Escopo
- Inclui lista de tipos, nível vigente e alteração auditada. NÃO inclui emitir documentos (FE-024/025/026) nem integrar ICP-Brasil.

## 3. Contexto necessário
Ler DRS §2.5 RN09/§4.4.6, Q-10, specs/shared/api-contracts.md#m2 (document-types), specs/shared/data-model.md#m2 e P-02 em specs/04-open-questions.md.

## 4. Detalhamento
Layout proposto Q-14 em /admin/documentos/tipos: tabela de prescrição, atestado, pedido de exame, declaração, relatório e encaminhamento, nível exigido, origem/default e data/ator da última mudança; modal de confirmação mostra impacto jurídico e histórico. Todos clínicos começam qualificada, declaração de comparecimento simples; a UI exibe configuração efetiva da API, não fixa regras locais. Loading, erro de permissão/conflito e sucesso; teclado/labels.

## 5. Critérios de aceite
- [ ] Dado admin, quando alterar nível e justificar, então versão e auditoria são registradas.
- [ ] Dado usuário sem permissão, quando acessar, então 403 e nenhum dado sensível.
- [ ] Dado provider dev, quando configurar qualificada, então documento emitido continua sem validade jurídica.
- [ ] Dado catálogo novo, quando abrir, então tipos/defaults de Q-10 aparecem..

## 6. Testes esperados
Permissões, alteração/versionamento, defaults, provider dev, erro/conflito e acessibilidade; lint.

## 7. Definition of Done
- [ ] Configuração não equivale à aprovação jurídica P-02; critérios/testes e lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Níveis finais e regras por conselho dependem P-02.
