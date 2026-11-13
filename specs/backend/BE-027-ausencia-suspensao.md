# BE-027 - No-show, justificativas e suspensão online

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente
- **Depende de:** BE-025, BE-026
- **Requisitos cobertos:** RF-015, RN-005, RN-006

## 1. Objetivo
Permitir à recepção confirmar ausência após o prazo, corrigir justificativas e aplicar a suspensão de autoagendamento sem apagar o atendimento.

## 2. Escopo
- Inclui: migration `Absence`, lista para conferência, decisão manual V1, histórico de correção e regra de três faltas em 12 meses.
- NÃO inclui: detecção/baixa automática de no-show, impedimento de agendamento assistido ou exclusão de histórico.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1` (absence), `specs/shared/data-model.md#m1`, `specs/shared/parameters.md` (`appointment.noshow_after_minutes`), DRS §3.2.10, RN-005/006 e Q-16.

## 4. Detalhamento
- Depois do prazo `appointment.noshow_after_minutes`, atendimento sem check-in/cancelamento entra na lista da recepção. Somente ela confirma manualmente; classificação `unjustified`, `justified` ou `clinic_fault`, com razão quando corrigida. `clinic_fault` não conta contra paciente.
- Ao completar três ausências **injustificadas** em janela móvel de 12 meses, suspender apenas autoagendamento do paciente, notificar recepção e manter marcação assistida. Justificativa posterior recalcula a condição e preserva histórico/autoria da mudança.
- Evento auditado alimenta indicadores M4; ausência não produz cancelamento retroativo nem apaga reserva histórica.

## 5. Critérios de aceite
- [x] Dada consulta sem check-in antes de `appointment.noshow_after_minutes`, quando tentar marcar no-show, então 409; após prazo, recepção pode confirmar manualmente.
- [x] Dadas três ausências injustificadas em 12 meses, quando confirmar a terceira, então autoagendamento é negado e recepção continua apta a agendar.
- [x] Dada ausência por falha da clínica ou justificada, quando contar, então não aumenta o total de penalidade.
- [x] Dada justificativa posterior, quando alterar classificação, então histórico conserva decisão anterior/ator e condição de suspensão é recalculada.

## 6. Testes esperados
Janela móvel, classificação, correção, suspensão/reversão, horário/fuso, autorizações, indicadores e auditoria; lint.

## 7. Definition of Done
- [x] Sem exclusão ou automatismo V1 não aprovado; conta/paciente preservados.
- [x] Testes/lint passam; parâmetro por chave e sem `tsc`.

## 8. Suposições e pontos em aberto
Default do prazo é provisório Q-16. Retirada automática da suspensão após sair da janela móvel é consequência da regra e deve ser conferida no teste de virada de período.


## Evidência local — 12/11/2026

Migration `202611120027_absence`, decisões/revisões versionadas e cifradas, lista de conferência, política dinâmica RN-006 e aviso essencial à recepção implementados conforme P-32. Ausência, encerramento da reserva ativa, histórico, recálculo, outbox e auditoria compartilham transação. Não cria cancelamento nem oferta retroativa; não há job de marcação automática. Confirmação/aceite online e consumidor da espera consultam fatos vigentes, sem confiar em cache manual ou exigir job para expirar penalidade. Classificação administrativa na agenda é restrita a staff; justificativa não é exposta no contrato de leitura.

**10/10 integrações específicas e 1/1 teste de calendário; regressão completa 111/111 integrações backend, 26/26 testes Node, 2/2 Vitest e lint em 198 arquivos aprovados.** Cobrem prazo pela chave de parâmetro, conferência sem writes, concorrência/idempotência, chegada/cancelamento/revogação, RBAC, terceira falta/atendimento assistido, correção/reversão/restabelecimento, revisão cifrada, expiração no aniversário, decisão tardia, aviso obsoleto/papel/consentimento e rollback. Consumidores de confirmação/check-in/espera passaram 35/35; fixtures antigas de suspensão manual foram substituídas por fatos de ausência, preservando a checagem de bloqueio real. Nenhum `tsc`.

Logs finais: `/tmp/vidaplena-be027-full-integration.log`, `-unit.log`, `-vitest.log`, `-lint.log`; baterias específicas em `-absence-final.log` e `-consumers.log`. PostgreSQL 17 descartável e Node 22.22.0; dados fictícios. P-32 explicita a interpretação de início do prazo e calendário para confirmação da clínica; P-01 continua jurídico antes de produção. Alterações sem commit por pedido do usuário; M1 ainda incompleto.
