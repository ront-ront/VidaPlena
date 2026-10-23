# FE-018 - Check-in, atrasos e no-show na agenda

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-015, BE-026, BE-027
- **Requisitos cobertos:** RF-014, RF-015, RNF-002

## 1. Objetivo
Permitir à recepção registrar chegada, decidir atraso e conferir ausências na própria agenda diária, com histórico de justificativas.

## 2. Escopo
- Inclui: ação Check-in, pendências administrativas, status Aguardando/Atrasado, lista de possíveis no-show e correção justificada.
- NÃO inclui: evolução clínica, ausência automática V1 ou suspensão manual fora da regra BE-027.

## 3. Contexto necessário
Ler `specs/frontend/design-system.md` (Agenda/status), Design System §§17/31, `specs/shared/api-contracts.md#m1` (check-in/absence/queue), `specs/shared/parameters.md` (late/noshow), DRS §§3.2.9–10 e Q-16.

## 4. Detalhamento
- A partir do slot FE-015 em até dois cliques, check-in exibe identificação administrativa, horário previsto/chegada e pendências cadastrais sem conteúdo clínico. Atraso acima de `appointment.late_tolerance_minutes` pede decisão de manter, remarcar ou encaixar via FE-016/017; não marca falta automaticamente.
- Lista de ausências potenciais só aparece após `appointment.noshow_after_minutes`; recepção confirma `unjustified/justified/clinic_fault` e pode corrigir depois com motivo, mantendo indicação do histórico. Badge de suspensão do autoagendamento não impede operação assistida.
- Loading/erro/conflito/sucesso atualizam grade e fila sem reload. Status combina texto/ícone/cor, teclado e leitor de tela acionam as mesmas ações.

## 5. Critérios de aceite
- [ ] Dada consulta do dia, quando recepção registrar chegada, então slot muda para Aguardando com horário e fila do profissional atualiza.
- [ ] Dado atraso além de `appointment.late_tolerance_minutes`, quando abrir ação, então opções de decisão aparecem sem criar falta automática.
- [ ] Dado prazo anterior a `appointment.noshow_after_minutes`, quando tentar marcar falta, então ação está indisponível e API rejeita tentativa forçada.
- [ ] Dada falha da clínica/justificativa, quando registrar ou corrigir, então UI mostra classificação/histórico e não sugere penalidade indevida.
- [ ] Dado fluxo iniciado na agenda, quando executar check-in, então acesso ocorre em até dois cliques e sem reload integral.

## 6. Testes esperados
Check-in, tolerâncias por chave, classificação/correção, fila, suspensão, dois cliques, teclado e estados; lint.

## 7. Definition of Done
- [ ] FE-015/016/017 integradas sem duplicar autorização; texto/ícone além de cor.
- [ ] Testes/lint passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Defaults de atraso/no-show são provisórios Q-16. Decisão de ausência permanece manual na V1.
