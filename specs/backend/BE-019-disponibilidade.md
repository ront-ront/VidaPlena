# BE-019 - Consulta de disponibilidade e antecedência

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** BE-017, BE-018
- **Requisitos cobertos:** RF-006, RN-003, RNF-009

## 1. Objetivo
Expor horários ofertáveis por especialidade, profissional, modalidade e período, descontando ocupações, bloqueios e salas indisponíveis.

## 2. Escopo
- Inclui: geração de slots, filtros, data mais próxima, janela de antecedência do portal e paginação temporal.
- NÃO inclui: confirmação/reserva (BE-020/021), promessa de que slot continuará livre até o clique final.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1`, `specs/shared/data-model.md#m1`, `specs/shared/parameters.md` (desempenho), DRS §3.2.1, RN-002/003 e Q-07/Q-22.

## 4. Detalhamento
- Construir slots com duração da especialidade e tipo, faixas publicadas, modalidades aceitas, férias/bloqueios e reservas `held/confirmed`. Paciente vê apenas início com antecedência RN-003; recepção aplica escopo operacional e encaixe separado.
- Presencial exige ao menos uma sala ativa livre em todo o intervalo; remoto não consulta sala. Sem profissional específico, combinar profissionais da especialidade, ordenados por dia/hora/profissional sem expor quem ocupa outro slot.
- `nearestAvailableAt` só aponta opção realmente elegível na consulta atual; cache, se usado, deve ser invalidado por reserva/bloqueio/cancelamento. BE-020 revalida tudo na confirmação.

## 5. Critérios de aceite
- [ ] Dado slot ocupado, bloqueado ou sala indisponível, quando buscar, então ele não aparece para marcação presencial.
- [ ] Dado paciente e início antes da antecedência RN-003, quando buscar, então não aparece; recepção tem fluxo operacional próprio.
- [ ] Dada especialidade sem horários, quando buscar, então `days` vazio e `nearestAvailableAt` só aparece se houver opção posterior verificada.
- [ ] Dada massa/carga de `shared/performance-scenario.md`, quando medir p95, então a consulta atende `perf.availability_p95_ms`; resultado real fica pendente até BE-051.

## 6. Testes esperados
Intervalos adjacentes, bloqueios, modalidades, sala, antecedência, datas/fuso, filtros e integração com reserva concorrente; benchmark BE-051 posterior. Lint.

## 7. Definition of Done
- [ ] Endpoint sem dados de ocupante; filtros/ordem determinísticos e contrato respeitado.
- [ ] Testes/lint passam; desempenho ainda precisa ensaio formal BE-051, sem `tsc`.

## 8. Suposições e pontos em aberto
Limite máximo da janela de busca é escolha técnica para proteger carga; documentar valor no contrato antes da implementação, sem tratá-lo como política clínica.
