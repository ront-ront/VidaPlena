# Operação local e evidências de BE-014

## Sondas e métricas

- `/health/live`: processo HTTP vivo; `/health/ready`: PostgreSQL essencial consultado com timeout `ops.readiness_timeout_ms`. O corpo da falha não inclui detalhes internos.
- `/v1/admin/ops/metrics`: scrape Prometheus autenticado como admin com MFA. Configurar coletor e destino de logs/alertas no ambiente P-07; a API só emite métricas e eventos JSON no stdout. Não tratar contador local de processo como disponibilidade mensal de produção.
- `vidaplena_http_requests_total` e `vidaplena_http_duration_seconds`: rota template, método e status; nunca URL concreta, query, CPF ou tokens. `vidaplena_readiness`, `vidaplena_notification_backlog`, `vidaplena_jobs_total` e `vidaplena_operational_alerts_total` complementam. Alertas de 5xx, lentidão, readiness e falha de job são eventos `ops.alert` e contadores; configurar roteamento externo em P-07.

## Janela de manutenção

Admin registra em `POST /v1/admin/ops/maintenance-windows` início/fim UTC e `noticeReference` de um aviso já comunicado pela operação. A API exige antecedência `ops.maintenance_notice_hours`, rejeita sobreposição e limita a soma por mês UTC a `ops.maintenance_max_hours_month`, com auditoria. O registro prova a declaração do operador, não o envio ou recebimento do aviso. Guardar fora do sistema a evidência de publicação com data, público-alvo e canal; validar fuso da clínica e horário de atendimento em P-07 antes de produção.

## Verificação de RNF-006/024

Medir uptime mensal no monitor externo, registrar incidentes e duração, comparar com `ops.availability_percent_min`; registrar plano de expansão horizontal, localidade brasileira e testes reais de escala. Sem esses dados, RNF-006/024 permanecem parcialmente implementados/pendentes de ambiente.
