# Cenário de desempenho e concorrência

**Origem:** RNF-006–011, RNF-024/025 e decisão Q-22. Este cenário é **provisório**, sujeito à infraestrutura-alvo e ao responsável do requisito (P-07). Metas parametrizadas em `parameters.md`; relatórios de ensaio citarão chave, valor, percentil e ambiente.

## Massa fictícia reprodutível

Gerador versionado com semente fixa, sem dado real de paciente: 5.000 pacientes, 30 profissionais, 100.000 atendimentos históricos, média de 20 evoluções/paciente, pelo menos um prontuário pesado com 300 evoluções, um anexo de cerca de 1 MB a cada cinco evoluções e 10.000 agendamentos futuros. Registrar número de linhas por tabela, tamanho total, índices e versão do schema usados no ensaio.

## Ambiente e roteiro

- Máquina de referência documentada (CPU/RAM/disco/SO), banco equivalente a homologação, cliente na mesma região com perfil 50 Mbps e 40 ms. Medir tempo do servidor e LCP no navegador separadamente. Perfil 4G é cenário secundário do front.
- Scripts versionados k6 ou Locust; aquecimento 2 min, carga estável 10 min. Base `perf.base_concurrent_users`, pico `perf.peak_concurrent_users`; também verificar mínimo de `perf.internal_concurrent_users_min` e `perf.video_concurrent_sessions_min` em ensaios separados.
- 200 atendimentos/dia é volume funcional mínimo. Cenário 3x por Q-22: (a) carga tripla com massa base; (b) massa tripla (15.000 pacientes/300.000 atendimentos) com carga base. Manter metas e comparar degradação de RNF-010 por `perf.growth_degradation_percent_max`.
- Reportar p50/p95/p99, throughput, erro, saturação CPU/memória/banco, falhas de conexão e o número de reservas concorrentes confirmadas. Nenhum resultado pode ser apresentado sem massa, ambiente e data.

## Operações e metas

| Operação | Chave de meta p95 | Critério adicional |
| --- | --- | --- |
| Abrir prontuário médio | `perf.chart_p95_ms` | Dados clínicos filtrados por vínculo; auditoria ativa. |
| Abrir prontuário pesado | `perf.heavy_chart_p95_ms` | Exceção explícita ao limite geral RNF-009. |
| Buscar paciente | `perf.patient_search_p95_ms` | Sem vazar dados de outro perfil. |
| Consultar disponibilidade | `perf.availability_p95_ms` | Exceção explícita ao limite geral RNF-009. |
| Confirmar agendamento | `perf.booking_p95_ms` | Duas ou mais requisições simultâneas para mesmo profissional/sala: exatamente uma confirmação, demais conflito, zero registro parcial. |
| Consultar agenda e leituras não substituídas | RNF-009 do DRS | 95% abaixo de 1 s; escritas não substituídas abaixo de 2 s sob carga normal. |
| Erros de operação | `perf.error_rate_percent_max` | Erros de conflito esperados em teste de colisão são contados separadamente de falhas inesperadas. |

## Vídeo e operação

- RNF-011: 720p/30 fps com 1,5 Mbps disponível, latência fim a fim <300 ms, adaptação de qualidade e áudio prioritário. RNF-025: pré-teste informa câmera/microfone e banda mínima de 2 Mbps subida/descida. Testar em Chrome/Edge/Firefox/Safari das duas versões mais recentes (RNF-023) sem extensão.
- Em V1 P2P, medir 40 sessões 1:1 simultâneas como requisito de capacidade, considerando sinalização e possível tráfego TURN próprio (P-10). Não alegar desempenho de produção sem infraestrutura-alvo.
- Disponibilidade mensal `ops.availability_percent_min`, manutenção programada ≤2 h/mês fora do atendimento com aviso ≥48 h; backup completo diário/incremental contínuo, RPO/RTO conforme `ops.rpo_minutes_max`/`ops.rto_hours_max`, cópia cifrada distinta e simulação semestral. Estes itens exigem evidência operacional e não são provados por teste unitário.

## Evidência exigida nas specs BE-051/052

Gerador e scripts versionados, comando de execução, ambiente, massa, relatório p50/p95/p99 por rota, taxa de erro, teste de corrida da agenda e relatório de mídia. Estado de cada RNF deve ser “verificado”, “parcial” ou “pendente de ambiente”, com motivo rastreável na matriz. Não converter meta provisória em resultado alcançado por existir o script.
