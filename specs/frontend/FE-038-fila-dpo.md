# FE-038 - Fila do DPO e revisão de consentimentos

- **Software:** front
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** FE-008, FE-037, BE-012, BE-050
- **Requisitos cobertos:** RF-004, RF-005, RF-032, RNF-016

## 1. Objetivo
Permitir ao detentor de privacy.dpo revisar pedidos dos titulares, consentimentos e revogações sem ler conteúdo clínico.

## 2. Escopo
- Inclui fila por status/prazo, histórico de aceite/revogação e decisão auditada; fallback de admin se não houver DPO. NÃO inclui acesso a evolução/anexo/gravação.

## 3. Contexto necessário
Ler DRS §§3.1.4–5/§3.5.5, Q-20, shared/api-contracts.md#m0 (privacy), shared/access-policy.md e frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14 em /privacidade/solicitacoes: cards de pendente/vencendo, filtros de tipo/status, tabela de protocolo/paciente/data/prazo, painel de metadados de consentimento/versão e formulário de decisão/explicação. Permissão privacy.dpo revalidada pela API; sem DPO, admin vê fila limitada com aviso de ausência de designação. Nada de conteúdo clínico; pedido formal de acesso/exportação é processado pelo fluxo BE-012 com revisão legal P-01. Loading, vazio, 403, conflito de decisão e sucesso auditado; navegação por teclado.

## 5. Critérios de aceite
- [ ] Dado gestor sem privacy.dpo, quando abrir, então 403.
- [ ] Dado DPO, quando consultar, então vê consentimentos/metadados sem prontuário.
- [ ] Dado nenhum DPO designado, quando admin abrir, então alerta e fila de fallback aparecem.
- [ ] Dado pedido resolvido por outro ator, quando decidir, então conflito evita dupla decisão.
- [ ] Dada decisão, quando salvar, então responsável/tempo/motivo são auditados.

## 6. Testes esperados
Permissão/fallback, metadados, conflito, auditoria, revogação e acessibilidade; lint.

## 7. Definition of Done
- [ ] Sem acesso clínico por privacy.dpo; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
P-01 valida fluxos jurídicos; P-08 designação formal.
