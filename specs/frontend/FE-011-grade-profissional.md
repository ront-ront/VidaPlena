# FE-011 - Grade e bloqueios do profissional

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-010, BE-018
- **Requisitos cobertos:** RF-011

## 1. Objetivo
Permitir editar e publicar faixas, modalidades, férias e bloqueios com prévia de impacto sobre consultas já confirmadas.

## 2. Escopo
- Inclui: `/agenda/grade`, editor semanal e bloqueios pontuais, versão, validação, revisão de impacto.
- NÃO inclui: remarcação em si (FE-016), cálculo da disponibilidade (BE-019), calendário externo de feriados.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (M1), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m1` (schedule), DRS §3.2.6 e Q-14.

## 4. Detalhamento
- Layout proposto Q-14: cabeçalho com profissional/versão, grade por dia com início/fim/intervalo/modalidade, seção férias/bloqueios e painel de prévia. Profissional edita própria grade; recepção/gestor operam conforme autorização. Campos de hora mostram fuso da clínica e erros junto da faixa.
- Ao publicar, `expectedVersion` previne perda de edição concorrente. Se API devolver `SCHEDULE_IMPACT_REVIEW`, listar consultas afetadas e conduzir ações de RF-009/010; não marcar grade publicada até resolução. Bloqueio emergencial identifica motivo e avisos.
- Loading, vazio inicial, intervalo inválido/sobreposto, conflito de versão, impacto e sucesso têm feedback acionável; teclado e tablet funcionais.

## 5. Critérios de aceite
- [ ] Dadas faixas sobrepostas, quando publicar, então UI aponta as faixas e mantém versão anterior.
- [ ] Dada consulta futura afetada, quando publicar sem decisão, então painel mostra impacto e não exibe sucesso falso.
- [ ] Dado conflito de versão, quando outro operador salvar antes, então UI pede recarga/revisão sem sobrescrever.
- [ ] Dado profissional, quando abrir grade alheia, então API nega e tela não expõe edição.

## 6. Testes esperados
Faixas/modalidades, bloqueios, conflito de versão, impacto, permissão e teclado; lint front.

## 7. Definition of Done
- [ ] Campos/estados seguem design system e contrato; nenhuma regra de horário duplicada no componente.
- [ ] Testes/lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
O editor é proposta Q-14; feriados são informados pela clínica, sem calendário externo presumido.
