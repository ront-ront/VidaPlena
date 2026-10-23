# BE-018 - Grade, férias e bloqueios do profissional

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** BE-016, BE-004
- **Requisitos cobertos:** RF-011, RN-002

## 1. Objetivo
Publicar a grade do profissional por dia, faixa e modalidade, com férias, feriados, intervalos e bloqueios pontuais auditáveis.

## 2. Escopo
- Inclui: `AvailabilityRule`/`ScheduleBlock`, versão publicada, validação de sobreposição e revisão de atendimentos afetados.
- NÃO inclui: cálculo final de slots (BE-019), reserva (BE-020), decisão automática por consultas já confirmadas.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m1`, `specs/shared/api-contracts.md#m1`, DRS §3.2.6, RN-001/002 e Q-06.

## 4. Detalhamento
- Profissional edita própria grade; recepção e gestor operam conforme RF-011, admin presta suporte. Cada alteração informa `expectedVersion`, ator e origem; janelas em fuso da clínica são validadas antes de converter a UTC.
- Faixas não se sobrepõem; intervalos, férias, feriados e bloqueios retiram disponibilidade. Bloqueio emergencial pode ser publicado imediatamente, mas consultas existentes entram em lista de impacto e seguem RF-009/010 com aviso; não são apagadas silenciosamente.
- Se uma alteração afetar consultas confirmadas, `SCHEDULE_IMPACT_REVIEW` exige resolução individual explícita; publicar versão só após consistência, preservando versões/auditoria.

## 5. Critérios de aceite
- [ ] Dadas faixas sobrepostas ou invertidas, quando publicar, então 400/409 e versão anterior permanece.
- [ ] Dada grade com consulta confirmada afetada, quando remover faixa sem decisão, então 409 mostra consultas autorizadas e nenhuma reserva é perdida.
- [ ] Dado bloqueio de férias, quando consultar disponibilidade futura, então slots cobertos desaparecem sem alterar prontuários/agendamentos passados.
- [ ] Dado profissional tentando grade alheia, quando chamar API, então 403 e evento de negativa auditado.

## 6. Testes esperados
Versão concorrente, fuso/DST quando aplicável, sobreposição, impacto e permissões, auditoria de publicação; lint.

## 7. Definition of Done
- [ ] Migration e casos de uso de grade/bloqueio; versões persistidas e contrato único.
- [ ] Testes/lint passam; decisão de reagendamento fica para BE-022/023, sem `tsc`.

## 8. Suposições e pontos em aberto
Calendário concreto de feriados/localidade não foi fornecido; bloquear apenas datas informadas pela clínica, sem importar calendário externo presumido.
