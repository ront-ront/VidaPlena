# FE-013 - Confirmação de agendamento do paciente

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-007, FE-012, BE-021
- **Requisitos cobertos:** RF-007, RF-008, RNF-001, RNF-021, RNF-004

## 1. Objetivo
Concluir a marcação escolhida em FE-012 com confirmação explícita, aviso de duplicidade e recuperação de conflito sem registro parcial.

## 2. Escopo
- Inclui: resumo do horário, paciente/dependente, tipo/modalidade, confirmar, duplicidade e alternativas de slot perdido.
- NÃO inclui: escolha de sala, videochamada, pagamento ou gestão da lista de espera.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (`/agendar`), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m1` (`POST /appointments`), DRS §§3.2.2–3.2.3, RNF-001/004/021 e Q-05/Q-07.

## 4. Detalhamento
- Layout proposto Q-14: seção de revisão com data/hora, profissional, especialidade, modalidade e paciente; botão principal Confirmar e retorno para horários. Tipo primeira/retorno explícito. Responsável seleciona apenas dependentes vinculados. Presencial exibe sala após confirmação, não seletor; remoto informa que preparo/entrada é M3.
- Enviar idempotency key pelo FE-004. `DUPLICATE_SPECIALTY_WARNING` solicita ciência explícita antes de nova tentativa. `SLOT_UNAVAILABLE` explica que horário deixou de estar disponível e mostra alternativas da API/volta à busca, preservando filtros. Consentimento/suspensão mostram próximo passo sem revelar dado alheio.
- Loading bloqueia duplo envio; sucesso mostra número/estado e caminho Minhas consultas. FE-012+013 têm no máximo quatro interações principais, a verificar em protótipo e teste RNF-001.

## 5. Critérios de aceite
- [ ] Dado duplo clique/refresh na confirmação, quando API processar, então uma única consulta aparece na UI.
- [ ] Dado horário tomado, quando receber `SLOT_UNAVAILABLE`, então mensagem menciona indisponibilidade, preserva filtros e oferece horários alternativos.
- [ ] Dada consulta futura na mesma especialidade, quando receber aviso, então não reenvia sem ciência explícita.
- [ ] Dado fluxo completo FE-012+013, quando testar navegação, então no máximo quatro interações principais; 90% em até três minutos sem auxílio requer ensaio com usuários.
- [ ] Dado 360 px e leitor de tela, quando confirmar, então resumo/erro/sucesso são utilizáveis em WCAG 2.1 AA.

## 6. Testes esperados
Idempotência, duplicidade, conflito, consentimento, dependente, modalidades, 360 px/teclado; ensaio RNF-001 com participantes e relatório.

## 7. Definition of Done
- [ ] Nenhum estado de sucesso antes do 201 da API; mensagens em pt-BR.
- [ ] Testes/lint passam; dados clínicos não aparecem, sem `tsc`.

## 8. Suposições e pontos em aberto
Medição de RNF-004 inclui recepção/profissional em FE-015/FE-021 após treinamento, não é provada por esta tela isolada.
