# BE-025 - Lembretes, respostas, preferências e retry

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente
- **Depende de:** BE-006, BE-021, BE-023
- **Requisitos cobertos:** RF-013, RN-005

## 1. Objetivo
Programar lembretes essenciais de consulta, registrar entrega/falha e interpretar respostas sem ignorar consentimento e preferência vigentes.

## 2. Escopo
- Inclui: jobs por consulta, resposta do portal, retry idempotente, sinalização à recepção e reprogramação/cancelamento.
- NÃO inclui: provedor SMS/WhatsApp, opt-out de mensagem essencial, cancelamento em si (BE-023).

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1` (lembretes), `specs/shared/parameters.md` (`reminder.schedule_hours_before`), `specs/shared/business-rules.md` RN-005, DRS §3.2.8 e Q-18.

## 4. Detalhamento
- Para consulta confirmada, jobs por instante de `reminder.schedule_hours_before` com teto de dois envios por consulta; reagendamento recria chaves e invalida horários antigos, cancelamento encerra jobs. Payload mínimo: data/hora/profissional/modalidade e endereço ou caminho de preparo, sem conteúdo clínico.
- BE-006 decide categoria essencial/canal ativo/preferência no momento **do envio**, registra snapshot/status; sem canal externo, portal + indicador de contato à recepção. Revogação de dados bloqueia todos os envios não legais, mesmo enfileirados. Opt-out não essencial não bloqueia lembrete essencial.
- Falha de e-mail registra tentativa e retry sem duplicar entrega; após falha persistente, marcar contato manual na agenda. Resposta `confirm` atualiza presença declarada; `cannot_attend` orienta RF-010 e aciona espera após cancelamento efetivo.

## 5. Critérios de aceite
- [x] Dada consulta confirmada, quando os instantes de `reminder.schedule_hours_before` chegarem, então há no máximo dois envios registrados por consulta.
- [x] Dado opt-out de marketing, quando enviar lembrete, então ele continua elegível; sem canal externo ativo, fica no portal e recepção é avisada.
- [x] Dada revogação antes de job, quando processar, então nenhum envio não legal ocorre.
- [x] Dado reagendamento/cancelamento, quando job antigo vencer, então não envia dados do horário anterior; retry não duplica lembrete entregue.
- [x] Dada resposta de impossibilidade, quando recebida, então oferece cancelamento e só aciona espera após confirmação do RF-010.

## 6. Testes esperados
Relógio injetado, mudança de hora, opt-out, revogação, falha/retry, canal ausente, idempotência e resposta; lint.

## 7. Definition of Done
- [x] Jobs usam dispatcher M0 e parâmetros por chave; status/preferência persistidos.
- [x] Testes/lint passam; conteúdo mínimo e `tsc` não executado.

## 8. Suposições e pontos em aberto
Intervalo e número de tentativas de retry são escolha técnica a registrar na implementação, sem mudar o limite de dois lembretes bem-sucedidos. Lista final de mensagens essenciais requer jurídico P-01.


## Evidência de implementação local — 12/11/2026

Migration `202611120025_reminders`, planejamento transacional por consulta/versão, reconciliação de registros preexistentes, worker PostgreSQL e dispatcher M0 integrados. P-30 define limite global por consulta/evento com múltiplos destinatários, estágios vencidos e projeção administrativa. Envio e mudança de consulta compartilham lock transacional; confirmação de presença é append-only e separada do check-in/cancelamento. A listagem própria preserva a declaração da versão vigente após recarga.

**14/14 integrações específicas e regressão completa de 101/101 integrações backend, 25/25 testes Node, 2/2 Vitest e lint backend em 188 arquivos aprovados.** PostgreSQL 17 descartável e Node 22.22.0; nenhum `tsc`. Cobrem concorrência/reinício/idempotência, payload cifrado/caixa dev, opt-out/fallback/atenção, revogação antes e depois da fila, remarcação/limite global/cancelamento, falha ambígua/retry/falha persistente, IDOR/representação/RN-004, histórico de respostas e estágios vencidos/reconciliação/importação. Logs finais em `/tmp/vidaplena-be026-final-{integration,unit,vitest,lint}.log`; checkpoints anteriores em `/tmp/vidaplena-be025-*.log`.

Endereço definitivo da clínica e validação jurídica P-01 permanecem pendentes. Caminho remoto M1 é administrativo; preparo/vídeo ficam em M3. Evidência local não equivale a implantação produtiva. A pedido do usuário, alterações permanecem sem commit.

Revisão final: canal externo só é elegível com adaptador ativo; se desativado, lembrete vai ao portal e sinaliza recepção. A escolha explícita de e-mail para confirmação de contato também respeita consentimento vigente; paciente revogado não recebe nem essa mensagem. Caso adicional validado com PostgreSQL real.
