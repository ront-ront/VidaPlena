# BE-052 - Ensaios de qualidade/capacidade da teleconsulta

- **Software:** back
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** BE-045, BE-054
- **Requisitos cobertos:** RNF-010, RNF-011, RNF-014

## 1. Objetivo
Definir ensaios de sinalização, qualidade de mídia e capacidade de sessões P2P simultâneas com relatório de limites reais.

## 2. Escopo
- Inclui scripts/roteiro de navegador, sinalizador/TURN, perda de rede e métricas; NÃO inclui afirmar E2E pleno ou criar provedor gerenciado.

## 3. Contexto necessário
Ler DRS §4.3.2–3/§4.4.3, Q-12/Q-22, shared/performance-scenario.md, shared/parameters.md (perf.video_concurrent_sessions_min), shared/api-contracts.md#m3 e P-04/P-10.

## 4. Detalhamento
Roteiro reprodutível cria pares fictícios autorizados até perf.video_concurrent_sessions_min, mede sinalização, vídeo 720p/30 fps com banda RNF-011, latência fim a fim <300 ms, perda/jitter, adaptação com áudio prioritário, reconexão RNF-008 e recursos do sinalizador/TURN. Separar telemetria WebRTC de tempo servidor; nunca copiar SDP/ICE/áudio para relatório. Cobrir Chrome/Edge/Firefox/Safari duas versões recentes RNF-023 via FE-031/032. Relatar falhas de NAT e dependência P-10; registrar que DTLS-SRTP atende trânsito e RNF-014 parcial por P-04. Sem infraestrutura-alvo, marcar pendente de ambiente.

## 5. Critérios de aceite
- [ ] Dadas perf.video_concurrent_sessions_min sessões autorizadas, quando ensaiar, então conectividade, taxa de falha e recursos constam do relatório.
- [ ] Dada banda RNF-011, quando medir, então fps/resolução/latência são comparados às metas e falhas explícitas.
- [ ] Dada rede instável, quando reduzir vídeo, então áudio prioritário é verificado.
- [ ] Dado relatório, quando inspecionar, então não contém mídia/SDP/ICE e RNF-014 consta parcial.

## 6. Testes esperados
Capacidade em ambiente real, navegador, qualidade, reconexão, isolamento/logs e classificação parcial; lint.

## 7. Definition of Done
- [ ] Relatório versionado com ambiente e métricas; testes/lint passam, sem tsc; nenhuma conformidade E2E alegada.

## 8. Suposições e pontos em aberto
P-10 decide STUN/TURN; P-04 decide E2E futuro; infraestrutura final P-07.
