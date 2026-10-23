# BE-051 - Massa reprodutível e ensaios de carga/concorrência da API

- **Software:** back
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** BE-020, BE-032, BE-048, BE-049
- **Requisitos cobertos:** RNF-009, RNF-010, RF-008

## 1. Objetivo
Especificar a implementação de gerador fictício, scripts de carga e relatório reproduzível para latência e colisão de agenda.

## 2. Escopo
- Inclui massa, k6/Locust, cenários base/pico/3x, métricas e evidências. NÃO inclui alterar regras de produto para mascarar resultados.

## 3. Contexto necessário
Ler DRS §4.3.1–2, Q-22, shared/performance-scenario.md, shared/parameters.md (perf.*), shared/api-contracts.md#m1/#m2/#m4 e backend/architecture.md.

## 4. Detalhamento
Gerador com semente fixa cria massas exatamente como performance-scenario.md, inclusive prontuário pesado, anexos e agenda futura; script versionado registra semente/schema/contagens. Scripts k6 ou Locust executam aquecimento/carga estável e operações buscar paciente, disponibilidade, confirmar, abrir prontuário médio/pesado, agenda e relatórios; registram p50/p95/p99, taxa de erro, throughput, CPU/RAM/banco, tempo servidor e LCP navegador separadamente. Ensaiar base, pico, carga multiplicada por perf.growth_multiplier com massa base e massa multiplicada com carga base; conferir metas por chaves perf.* e limite de degradação. Concorrência de mesma sala/profissional deve confirmar exatamente uma reserva e demais 409, sem linha parcial. Relatório versionado indica ambiente, rede, data e estados verificado/parcial/pendente de ambiente; RNF-006/007 requerem evidência operacional separada.

## 5. Critérios de aceite
- [ ] Dada semente fixa, quando gerar duas vezes em base limpa, então contagens/IDs determinísticos coincidem.
- [ ] Dadas requisições simultâneas ao mesmo slot, quando executar, então uma confirma e demais conflitam sem sobreposição.
- [ ] Dado cenário base/pico/3x, quando medir, então p50/p95/p99 e meta por chave perf.* constam no relatório.
- [ ] Dado ensaio sem infraestrutura equivalente, quando registrar resultado, então estado é pendente de ambiente, não conformidade comprovada.

## 6. Testes esperados
Gerador determinístico, consulta de contagens, corrida real no PostgreSQL, scripts de carga e validação do relatório; lint.

## 7. Definition of Done
- [ ] Evidência e scripts reproduzíveis, sem dado real; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Infraestrutura e metas finais pendem P-07; exceções RNF-009/010 Q-22 documentadas.
