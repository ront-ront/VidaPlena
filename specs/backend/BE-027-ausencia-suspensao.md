# BE-027 - No-show, justificativas e suspensão online

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
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
- [ ] Dada consulta sem check-in antes de `appointment.noshow_after_minutes`, quando tentar marcar no-show, então 409; após prazo, recepção pode confirmar manualmente.
- [ ] Dadas três ausências injustificadas em 12 meses, quando confirmar a terceira, então autoagendamento é negado e recepção continua apta a agendar.
- [ ] Dada ausência por falha da clínica ou justificada, quando contar, então não aumenta o total de penalidade.
- [ ] Dada justificativa posterior, quando alterar classificação, então histórico conserva decisão anterior/ator e condição de suspensão é recalculada.

## 6. Testes esperados
Janela móvel, classificação, correção, suspensão/reversão, horário/fuso, autorizações, indicadores e auditoria; lint.

## 7. Definition of Done
- [ ] Sem exclusão ou automatismo V1 não aprovado; conta/paciente preservados.
- [ ] Testes/lint passam; parâmetro por chave e sem `tsc`.

## 8. Suposições e pontos em aberto
Default do prazo é provisório Q-16. Retirada automática da suspensão após sair da janela móvel é consequência da regra e deve ser conferida no teste de virada de período.
