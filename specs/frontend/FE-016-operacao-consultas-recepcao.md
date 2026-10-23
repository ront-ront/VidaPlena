# FE-016 - Agendar e alterar consulta pela recepção

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-015, BE-021, BE-022, BE-023
- **Requisitos cobertos:** RF-007, RF-009, RF-010, RNF-002

## 1. Objetivo
Permitir à recepção confirmar, remarcar e cancelar consultas sem abandonar o contexto do dia e com decisão visível sobre sala e impacto.

## 2. Escopo
- Inclui: painéis/diálogos acionados na agenda, seleção de paciente/horário/sala, motivo e confirmações.
- NÃO inclui: cadastro presencial (FE-039), lista de espera (FE-017), autoatendimento do paciente (FE-013/014).

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (Agenda), `specs/frontend/design-system.md`, Design System §§17/31, `specs/shared/api-contracts.md#m1` (appointments/rooms/availability), DRS §§3.2.2–3.2.5 e Q-06/Q-07.

## 4. Detalhamento
- Abrir a partir do slot/ação da FE-015 em até dois cliques, sem reload. Painel de agendamento tem paciente/dependente, especialidade, profissional, tipo, modalidade, horário e **sala sugerida** para presencial; recepção pode trocar por outra sala livre, mas não prossegue sem sala. Modalidade remota oculta sala. Confirmar duplicidade de especialidade explicitamente.
- Reagendar mostra original e novo lado a lado; conflito mantém original visível. Cancelar mostra política/origem e motivo; clínica/profissional são destacados na comunicação. Ações fora de RN-004 exigem ator/motivo de recepção. Após 201/200, atualizar grade e manter data/filtros/foco.
- Loading bloqueia repetição; 409 `SLOT_UNAVAILABLE` oferece horários próximos; consentimento/suspensão/paciente inexistente têm orientação em pt-BR. Em mobile, painel vira Sheet acessível e grade permanece scroll próprio.

## 5. Critérios de aceite
- [ ] Dado presencial, quando escolher horário, então sala livre é sugerida; troca só aceita outra livre, e ausência de sala impede confirmar.
- [ ] Dado conflito concorrente, quando API responder 409, então painel explica indisponibilidade, oferece alternativas e nenhuma consulta é mostrada como confirmada.
- [ ] Dado reagendamento falho, quando fechar/voltar, então consulta original permanece no slot antigo.
- [ ] Dado cancelamento pela clínica, quando concluir, então grade/histórico mostram origem e aviso foi agendado pelo backend.
- [ ] Dada qualquer ação comum, quando partir da agenda, então é acessível em até dois cliques e sem reload integral.

## 6. Testes esperados
Sala auto/troca, duplicidade, três operações, conflito, prazo/motivo, filtro/foco e teclado; ensaio RNF-002/004 com FE-015.

## 7. Definition of Done
- [ ] Chama serviços FE-004 e contratos M1, sem regra de colisão só no front.
- [ ] Testes/lint passam; nenhuma tela clínica acessada, sem `tsc`.

## 8. Suposições e pontos em aberto
O desenho exato do painel é proposta Q-14 aplicada ao layout explícito da agenda; não há escolha de sala pelo profissional.
