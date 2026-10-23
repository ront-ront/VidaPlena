# BE-032 - Leitura do prontuário e timeline auditada

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-030, BE-004, BE-013
- **Requisitos cobertos:** RF-016, RF-022, RN-007, RNF-009

## 1. Objetivo
Servir cabeçalho, alertas e linha do tempo clínica para profissional com base de acesso válida, com paginação e auditoria por leitura.

## 2. Escopo
- Inclui: `ClinicalRecord`/`ClinicalEncounter`, criação sob demanda, endpoint de cabeçalho/timeline, filtros e marcador de histórico importado.
- NÃO inclui: escrita de evolução (BE-035/036), projeção do paciente (BE-043) ou escolha de campos entre especialidades sem P-06.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2`, `specs/shared/api-contracts.md#m2` (leitura), `specs/shared/access-policy.md`, DRS §§3.3.1/3.3.7, Design System §18 e `shared/performance-scenario.md`.

## 4. Detalhamento
- Header retorna identificação, número, última consulta, alertas críticos e base de vínculo/urgência, nunca por role profissional isolado. Timeline por período/especialidade/tipo usa cursor estável, resumos autorizados e tag de origem importada. Sem histórico, `firstVisit=true` e coleção vazia.
- Cada página e detalhe registra ator, paciente, recurso, base autorizadora e requestId. Sem vínculo, 404 genérico e negativa auditada; expirado permite apenas rota de evoluções próprias BE-030.
- Índices/consulta paginada visam `perf.chart_p95_ms` e `perf.heavy_chart_p95_ms` no cenário Q-22; não carregar 300 evoluções de uma vez. Campos de outras especialidades aguardam P-06 e falham fechados.

## 5. Critérios de aceite
- [ ] Dado profissional com vínculo vigente, quando abrir, então header/alertas/timeline autorizada aparecem e acesso é auditado com `CareLink.id`.
- [ ] Dado paciente sem histórico, quando abrir, então `firstVisit=true` sem erro/registro inventado.
- [ ] Dado profissional sem vínculo, quando manipular ID, então 404 sem conteúdo e negativa auditada.
- [ ] Dado histórico pesado do cenário Q-22, quando paginar, então só o bloco solicitado é entregue; p95 será medido contra `perf.heavy_chart_p95_ms` em BE-051.

## 6. Testes esperados
Autorização por vínculo/urgência, campos entre especialidades, first visit, importado, paginação/cursor, auditoria por página e carga BE-051; lint.

## 7. Definition of Done
- [ ] Contrato único e seleção mínima de campos; nenhuma leitura clínica por admin/gestor/recepção.
- [ ] Testes/lint passam; p95 real pendente BE-051, sem `tsc`.

## 8. Suposições e pontos em aberto
Campos visíveis entre especialidades dependem P-06. O cabeçalho/timeline não deve antecipar o parecer clínico com projeção irrestrita.
