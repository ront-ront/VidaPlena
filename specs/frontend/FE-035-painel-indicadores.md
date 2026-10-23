# FE-035 - Painel gerencial de indicadores

- **Software:** front
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** FE-003, BE-048
- **Requisitos cobertos:** RF-030, RNF-016, UI-002

## 1. Objetivo
Mostrar métricas agregadas da clínica com filtros e estados honestos para falta/supressão de dados.

## 2. Escopo
- Inclui ocupação, absenteísmo, especialidades, modalidade e produtividade. NÃO inclui detalhe de paciente ou exportação (FE-036).

## 3. Contexto necessário
Ler DRS §3.5.3, Q-14, shared/api-contracts.md#m4 (indicators), frontend/design-system.md, frontend/screens-map.md e P-14.

## 4. Detalhamento
Layout proposto Q-14 em /gestao/indicadores: período e filtros no topo, cards de ocupação/absenteísmo, gráfico simples de volume por especialidade/modalidade e tabela de produtividade. Cada valor exibe denominador/intervalo; insufficientData mostra explicação, suppressed mostra “dados insuficientes para exibição” sem contagem. Loading skeleton, erro com retry, vazio e sucesso; não mostrar CPF/nome de paciente. Respeitar tokens, foco, leitor de tela e texto alternativo/tabela para gráfico; UI-002 pede visão rápida sem informação enganosa.

## 5. Critérios de aceite
- [ ] Dado período sem dados, quando abrir, então não aparece 0% enganoso.
- [ ] Dado grupo suprimido, quando filtrar, então valor e contagem exata não são mostrados.
- [ ] Dado recepção, quando acessar URL, então 403 e dados anteriores somem.
- [ ] Dado gestor, quando mudar filtro, então período e denominador atualizados aparecem.
- [ ] Dado leitor de tela, quando navegar gráfico, então tabela equivalente é acessível.

## 6. Testes esperados
Estados de dados, supressão, autorização, filtros, gráfico acessível e responsividade; lint.

## 7. Definition of Done
- [ ] Sem dado clínico identificável; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Fórmulas/limiar aguardam P-14.
