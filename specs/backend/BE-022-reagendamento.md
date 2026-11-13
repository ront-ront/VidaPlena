# BE-022 - Reagendamento transacional

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; planejamento de novos lembretes integra BE-025
- **Depende de:** BE-020, BE-021
- **Requisitos cobertos:** RF-009, RN-004

## 1. Objetivo
Transferir consulta futura para outro intervalo/profissional/modalidade preservando o original se a nova reserva falhar e mantendo histórico auditável.

## 2. Escopo
- Inclui: prazo de autoatendimento RN-004, troca atômica, motivo/origem, histórico, notificação e reprogramação de lembrete.
- NÃO inclui: cancelamento definitivo (BE-023), política de oferta da espera (BE-024), UI (FE-014/016).

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1`, `specs/shared/data-model.md#m1`, `specs/shared/business-rules.md` RN-001/004, DRS §3.2.4 e Q-07.

## 4. Detalhamento
- Paciente/responsável só altera consulta própria/dependente antes do limite RN-004; após isso, recepção registra motivo. Remarcação por profissional/clínica identifica a origem, informa paciente e oferece próximos horários.
- Use case revalida elegibilidade, duração, modalidade, sala e `expectedVersion`. BE-020 adquire nova reserva e libera a antiga na mesma transação; cria histórico ligado ao atendimento original. Em conflito/timeout, original permanece idêntico.
- Commit gera eventos de alteração para paciente/profissional, invalida lembretes anteriores e agenda novos via BE-025 quando disponível; outbox evita perda/duplicidade de aviso.

## 5. Critérios de aceite
- [x] Dado prazo RN-004 ultrapassado, quando paciente tentar remarcar, então 409 orienta recepção e original permanece.
- [x] Dado novo slot tomado concorrentemente, quando tentar, então 409 `SLOT_UNAVAILABLE`, reserva e dados originais permanecem, sem histórico falso.
- [x] Dado pedido da clínica, quando confirmar, então histórico/aviso identificam origem e próximos horários elegíveis são oferecidos.
- [x] Dada troca presencial/remota válida, quando concluir, então só o novo recurso é ocupado e a antiga reserva fica liberada.

## 6. Testes esperados
Prazo, IDOR, concorrência, rollback, troca de sala/modalidade, histórico, eventos e reprogramação de lembrete; lint.

## 7. Definition of Done
- [x] Uma unidade de trabalho atômica; contrato/erro estáveis e autoria auditada.
- [x] Testes pertinentes/lint passam, sem `tsc`; notificação não altera resultado da reserva.

## 8. Suposições e pontos em aberto
O pedido de remarcação após prazo pela recepção usa motivo obrigatório; lista de alternativas segue a busca atual, sem garantia de reserva até confirmação.

## Evidência local — 05/11/2026

Arquivo original lido integralmente, da primeira à última das 38 linhas. P-27 registra identidade estável, duração vigente e origem. Migration `202611050022_rescheduling` acrescenta origem ao histórico append-only. API autentica e revalida representação, consentimento, estado, versão, prazo original RN-004 e nova antecedência RN-003; escolha explícita de sala continua só recepção. Reserva antiga é liberada e nova confirmada na mesma transação de consulta/histórico/auditoria/outbox. Avisos pendentes são invalidados por versão; BE-025 cria novos lembretes a partir da nova versão. Notificação clínica destaca origem; anterior/novo profissional recebem aviso administrativo seguro.

Nove testes HTTP/PostgreSQL passaram: troca presencial/remota, ID/versão/histórico e idempotência; concorrência preservando original; motivo assistido, autoria e origem; transferência com avisos ao profissional anterior/novo; IDOR/origem forjada/cursor alheio; limite exato RN-004 e RN-003; rollback total após falha de auditoria; responsável/dependente com perda imediata de acesso; paginação 30+1 sem duplicação e filtros civis. Regressão de confirmação 9/9 junto: 18/18. Lint aprovado. Novos jobs de lembrete e resolução completa de inativação por cancelamento ficam nas specs próprias.

**Regressão completa ao concluir:** 52/52 integrações backend, 25/25 testes Node e 2/2 Vitest aprovados, com lint em 159 arquivos.

### Integração de chegada tardia BE-026/P-31

A alternativa de RF-014 estende a remarcação assistida a `waiting` com check-in efetivo do dia atual, somente pelos operadores já autorizados (recepção/admin), com motivo obrigatório. O original pode já ter iniciado, mas a nova reserva continua futura e passa por BE-020. Retorna `confirmed`, preserva o check-in/histórico anterior e exige nova chegada na nova versão. Portal não altera consulta em espera; dias anteriores não são reabertos. Não há bypass de consentimento, sala, grade, versão ou auditoria. Cobertura acrescentada em `tests/integration/checkin.test.ts`.
