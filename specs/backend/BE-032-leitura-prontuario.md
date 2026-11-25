# BE-032 - Leitura do prontuário e timeline auditada

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** leitura e início de atendimento implementados/verificados localmente; alertas BE-037 e conteúdo das próximas specs integram a projeção
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
- [x] Dado paciente sem histórico, quando abrir, então `firstVisit=true` sem erro/registro inventado.
- [x] Dado profissional sem vínculo, quando manipular ID, então 404 sem conteúdo e negativa auditada.
- [x] Dado histórico pesado do cenário Q-22, quando paginar, então só o bloco solicitado é entregue; p95 será medido contra `perf.heavy_chart_p95_ms` em BE-051.

## 6. Testes esperados
Autorização por vínculo/urgência, campos entre especialidades, first visit, importado, paginação/cursor, auditoria por página e carga BE-051; lint.

## 7. Definition of Done
- [x] Contrato único e seleção mínima de campos; nenhuma leitura clínica por admin/gestor/recepção.
- [x] Testes/lint passam; p95 real pendente BE-051, sem `tsc`.

## 8. Suposições e pontos em aberto
P-06 aprovada provisoriamente pelo usuário para implementação; pré-consulta expõe identificação/alertas, durante/pós expõem histórico finalizado. Validação clínica pré-produção permanece. P-58 concretiza início explícito e paginação sem ampliar o papel administrativo.

## Evidência local —25/11/2026

ClinicalRecord/ClinicalEncounter e índice cifrado append-only, GET header/timeline e POST encounters, primeira visita, pré-consulta restrita, união da agenda M1 concluída com índice clínico, filtros e cursor por paciente/escopo. Início é explícito, idempotente e transacional com estado/histórico/vínculo, sem ampliar reserva. Origem usa `clinic`, conforme CHECK existente. Negativas com UUID inexistente preservam alvo em resourceId sem FK a paciente inexistente.

31/31 integrações BE-030/031/032/006 (`/tmp/vidaplena-be032-regression.log`, sessão37990, saída0), revisão final10/10 BE-032 após incluir índice cifrado (`/tmp/vidaplena-be032-final-integration.log`, sessão93959, saída0); conjuntos sobrepostos.28/28 Node e lint238 aprovados; Prisma validate/generate e diff aprovados. Massa de300 consultas percorreu10 páginas de30, sem repetição, com cursor de outro paciente/filtro negado. Casos incluem urgência real/expiração/rejeição, rollback por falha de auditoria e imutabilidade SQL. Não é medição p95 BE-051.

O primeiro aceite permanece aberto na parte dos alertas reais até BE-037. ImportedHistory, evoluções/documentos/resultados concretos entram no índice nas respectivas specs BE-033/035–043; nenhum conteúdo foi inventado para declarar esses módulos concluídos. BE-030 ainda aguarda leitura de evolução própria fora do vínculo. Sem tsc ou banco dev.
