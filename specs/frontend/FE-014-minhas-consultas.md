# FE-014 - Minhas consultas, reagendar e cancelar

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-013, BE-022, BE-023
- **Requisitos cobertos:** RF-009, RF-010, RN-004

## 1. Objetivo
Mostrar consultas futuras/passadas e permitir ao paciente/responsável remarcar ou cancelar dentro do prazo, com histórico e confirmação claros.

## 2. Escopo
- Inclui: `/minhas-consultas`, detalhes, escolha de novo horário, confirmação de cancelamento e estados de conflito.
- NÃO inclui: operação da recepção (FE-016), conteúdo clínico ou vídeo da consulta.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (M1), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m1` (appointments), DRS §§3.2.4–3.2.5, RN-004 e Q-05.

## 4. Detalhamento
- Layout proposto Q-14: abas Futuras/Histórico, cards com data/hora/profissional/modalidade/status; detalhe mostra origem de remarcações. Ações Reagendar/Cancelar ficam próximas da consulta. Fora do prazo RN-004, substituí-las por orientação para recepção, sem permitir mutação direta.
- Reagendar reutiliza busca FE-012 com slot atual identificado; envio usa `expectedVersion`, novo intervalo e idempotency key. Até resposta 200, consulta original permanece visível; 409 mostra conflito e alternativa. Cancelar exige diálogo com política/motivo quando aplicável; sucesso mantém item no histórico.
- Loading/vazio/erro/sucesso, ações disabled e 360 px sem scroll horizontal; dados de dependente só se vínculo ativo. Notificações são resultado do backend, não promessa local.

## 5. Critérios de aceite
- [ ] Dado prazo RN-004 ultrapassado, quando paciente abrir consulta, então ação online não prossegue e contato da recepção é indicado.
- [ ] Dado conflito na nova reserva, quando API devolver 409, então consulta antiga continua com data/status originais.
- [ ] Dado cancelamento confirmado, quando recarregar, então item segue no histórico como cancelado e horário não aparece como ocupado pela consulta.
- [ ] Dado dependente sem vínculo, quando forçar URL/ID, então nenhum detalhe é exibido e API nega.

## 6. Testes esperados
Prazo, rebooking/cancelamento, conflito, histórico, dependente/IDOR, estados e 360 px; lint.

## 7. Definition of Done
- [ ] Fluxo usa FE-004/012 e contrato único, sem estado otimista incorreto.
- [ ] Testes/lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
Texto/canal de contato da recepção depende da configuração operacional da clínica, sem número inventado na spec.
