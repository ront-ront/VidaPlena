# BE-019 - Consulta de disponibilidade e antecedência

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; desempenho formal aguarda BE-051
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
- [x] Dado slot ocupado, bloqueado ou sala indisponível, quando buscar, então ele não aparece para marcação presencial.
- [x] Dado paciente e início antes da antecedência RN-003, quando buscar, então não aparece; recepção tem fluxo operacional próprio.
- [x] Dada especialidade sem horários, quando buscar, então `days` vazio e `nearestAvailableAt` só aparece se houver opção posterior verificada.
- [ ] Dada massa/carga de `shared/performance-scenario.md`, quando medir p95, então a consulta atende `perf.availability_p95_ms`; resultado real fica pendente até BE-051.

## 6. Testes esperados
Intervalos adjacentes, bloqueios, modalidades, sala, antecedência, datas/fuso, filtros e integração com reserva concorrente; benchmark BE-051 posterior. Lint.

## 7. Definition of Done
- [x] Endpoint sem dados de ocupante; filtros/ordem determinísticos e contrato respeitado.
- [x] Testes/lint passam; desempenho ainda precisa ensaio formal BE-051, sem `tsc`.

## 8. Suposições e pontos em aberto
Limite máximo da janela de busca é escolha técnica para proteger carga; documentar valor no contrato antes da implementação, sem tratá-lo como política clínica.

## Evidência local — 04/11/2026

Endpoint sem cache, leitura consistente de catálogo/grade/bloqueios/salas, geração por duração e modalidade, antecedência do portal, janela parametrizada e próxima data verificada. P-24 registra passo e limites técnicos. Suíte de 10/10: 5 integrações HTTP/PostgreSQL de catálogo/grade/disponibilidade, 3 regras de disponibilidade e 2 regras de grade/fuso; lint em 141 arquivos. Ocupação foi testada por porta explícita, mas a leitura de `SlotReservation` será integrada na BE-020 antes de alegar cobertura completa de conflito. Meta `perf.availability_p95_ms` segue pendente BE-051.

**Integração BE-020/021 em 05/11/2026:** leitura de reservas reais e holds vigentes já conectada; conflito de confirmação devolve alternativas sem identidade de ocupante. Falta de salas foi testada com profissional livre. A meta de carga continua pendente BE-051.

### Contexto temporal P-48 —13/11/2026

GET /scheduling/context retorna apenas fuso, instante e dia civil da clínica, com o guard de sessão existente. Não carrega agenda nem dados pessoais. Teste HTTP/PostgreSQL1/1 cobre os cinco perfis, ausência de sessão, MFA interno e OpenAPI; lint220 arquivos aprovado. Critérios de disponibilidade permanecem inalterados. FE-017 segue pendente.
