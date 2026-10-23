# BE-014 - Health, logs, métricas e alertas operacionais

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-001, BE-004
- **Requisitos cobertos:** RNF-006, RNF-024

## 1. Objetivo
Dar visibilidade operacional à API sem expor dados clínicos, para sustentar disponibilidade e resposta a falhas.

## 2. Escopo
- Inclui: health/liveness/readiness, logs estruturados, requestId, métricas de latência/erro e alertas configuráveis.
- NÃO inclui: garantia de SLA em nuvem, dashboard gerencial de pacientes (BE-048) ou backup (BE-015).

## 3. Contexto necessário
Ler `specs/backend/architecture.md` (“Segurança, operação”), `specs/shared/performance-scenario.md`, DRS §§4.2.2/4.7.2 e `specs/shared/api-contracts.md` (requestId).

## 4. Detalhamento
- Endpoint liveness confirma processo; readiness testa dependências necessárias sem devolver credenciais/detalhes internos ao público. Logs de requisição, erro, job e evento têm requestId, tipo, duração/status; não incluem CPF completo, senha, token, evolução, anexo ou mídia.
- Métricas agregadas por rota/status, latência, erro, fila/job e disponibilidade; alarmes para queda/readiness e degradação. Operações definirão destino e limiares conforme ambiente; dashboards técnicos restritos a admin, sem acesso clínico.
- Registrar janela de manutenção e aviso de 48 h para verificação de RNF-006, mas porcentagem mensal só se prova em ambiente implantado.

## 5. Critérios de aceite
- [ ] Dada API pronta, quando consultar readiness, então 200; com banco essencial indisponível, então status não pronto sem segredo.
- [ ] Dada requisição com dados sensíveis, quando produzir log, então nenhum conteúdo clínico/senha/token/arquivo aparece.
- [ ] Dado erro HTTP, quando inspecionar log e resposta, então ambos compartilham requestId.
- [ ] Dada falha de serviço simulado, quando ocorrer, então métrica/alerta técnico é emitido.

## 6. Testes esperados
Health com dependência saudável/indisponível, sanitização de log e correlação, emissão de métricas/alertas com adapter falso. Lint.

## 7. Definition of Done
- [ ] Logs sanitizados e acesso técnico restrito.
- [ ] Evidência local de instrumentação; SLA real marcado pendente de implantação.
- [ ] Testes/lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
Fornecedor de nuvem/monitoramento e máquina-alvo não definidos (P-07); RNF-006/024 só podem ser homologados no ambiente real.
