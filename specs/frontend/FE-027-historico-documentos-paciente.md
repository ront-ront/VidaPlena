# FE-027 - Histórico e documentos do paciente

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-008, BE-043
- **Requisitos cobertos:** RF-022, RNF-003, RNF-019

## 1. Objetivo
Exibir ao paciente ou responsável sua projeção publicada de histórico, resultados, prescrições, documentos e orientações.

## 2. Escopo
- Inclui /meu-historico, troca de dependente e download publicado. NÃO inclui evolução integral, hipótese, rascunho ou pedido formal de acesso RF-005.

## 3. Contexto necessário
Ler DRS §3.3.7, Q-03/Q-05/Q-09, specs/shared/access-policy.md (projeção), specs/shared/api-contracts.md#m2 (me/clinical-history), specs/frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14: título e seletor de pessoa autorizada, resumo temporal, filtros por tipo/período, cards de consulta e lista de documentos/resultados publicados; cada item exibe origem, data e status dev/anulado. Dados clínicos recebidos só da allowlist BE-043; URLs de download autenticadas. Loading skeleton, vazio com explicação, erro sem dados anteriores, paginação e layout móvel a partir de 360 px, teclado e texto acessível.

## 5. Critérios de aceite
- [ ] Dado documento não publicado, quando carregar histórico, então ele não aparece nem via URL direta.
- [ ] Dado dependente sem GuardianLink, quando alternar ID, então acesso é negado e dados anteriores somem.
- [ ] Dado consentimento revogado, quando abrir rota, então portal permanece bloqueado.
- [ ] Dado documento dev, quando exibir, então selo sem validade jurídica e status são claros.
- [ ] Dado histórico extenso, quando paginar, então só o bloco solicitado é carregado..

## 6. Testes esperados
Teste de projeção, IDOR/dependente, revogação, selo dev, paginação, estados e responsividade; lint.

## 7. Definition of Done
- [ ] Não mostrar conteúdo clínico interno; critérios/testes e lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Exceções de sigilo para menor e fluxo formal após revogação pendem P-01.
