# BE-048 - Indicadores agregados e proteção contra reidentificação

- **Software:** back
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** BE-021, BE-027, BE-030
- **Requisitos cobertos:** RF-030, RNF-016

## 1. Objetivo
Calcular ocupação, absenteísmo, volume por especialidade/modalidade e produtividade sem expor paciente ou conteúdo clínico.

## 2. Escopo
- Inclui consulta agregada filtrada e supressão de célula pequena. NÃO inclui exportação (BE-049) nem métricas de conteúdo clínico.

## 3. Contexto necessário
Ler DRS §3.5.3/§4.4.5, Q-20, shared/api-contracts.md#m4, shared/data-model.md#m4, shared/parameters.md (report.aggregation_min_subjects), shared/access-policy.md e P-14.

## 4. Detalhamento
GET indicators valida gestor/admin, datas/filtros e calcula fórmulas provisórias do contrato usando Appointment/Encounter, com denominadores e insufficientData explícitos. Nunca serializar Patient, Evolution, CPF ou IDs clínicos. Agrupamento pequeno e seus totais complementares são suprimidos para impedir reconstrução por subtração; sem valor aprovado para report.aggregation_min_subjects, não liberar célula potencialmente reidentificável. Filtros combinados são reavaliados antes de retornar; cache por filtros/versão não pode vazar escopo nem dados revogados. IndicatorSnapshot é otimização opcional só se medição pedir; sem criar requisito de snapshot.

## 5. Critérios de aceite
- [ ] Dado período sem atendimentos, quando consultar, então indicador retorna insufficientData e não zero enganoso.
- [ ] Dado filtro com grupo pequeno, quando consultar, então valor, denominador e totais complementares são suprimidos.
- [ ] Dado recepção ou paciente, quando consultar, então 403.
- [ ] Dado gestor, quando filtrar profissional, então nenhum identificador de paciente ou conteúdo clínico aparece.

## 6. Testes esperados
Fórmulas/denominadores, zero, supressão/filtros combinados, autorização, vazamento por cache e auditoria; lint.

## 7. Definition of Done
- [ ] Contrato e política P-14 respeitados; testes/lint passam, sem tsc; nenhum dado clínico identificável sai da rota.

## 8. Suposições e pontos em aberto
Fórmulas e limite final aguardam P-14; painel produtivo bloqueado até validação.
