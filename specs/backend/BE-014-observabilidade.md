# BE-014 - Health, logs, métricas e alertas operacionais

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada localmente; homologação de ambiente P-07 pendente
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

### Estado da implementação em 30/10/2026

Pino 10.4.0 emite JSON por allowlist de campos; `@prometheus-io/client` 0.16.1 fornece histogramas, contadores e gauges por instância. Liveness, readiness PostgreSQL com timeout, métricas admin/MFA, alertas de 5xx/lentidão/readiness/job e backlog de notificações estão ligados ao runtime. Registro de janela de manutenção com migration `202610300015_maintenance_windows`, antecedência e teto mensal UTC parametrizados, referência externa do aviso e auditoria. Testes Node 2/2 e integração 1/1 passaram; lint. Destino externo de alertas, comprovação real de entrega do aviso, horário local e disponibilidade mensal permanecem P-07. Evidência e instruções em `_work/05-operational-runbook.md`.
