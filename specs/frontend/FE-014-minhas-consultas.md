# FE-014 - Minhas consultas, reagendar e cancelar

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; ensaio com usuários/leitor de tela pendente
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
- [x] Dado prazo RN-004 ultrapassado, quando paciente abrir consulta, então ação online não prossegue e contato da recepção é indicado.
- [x] Dado conflito na nova reserva, quando API devolver 409, então consulta antiga continua com data/status originais.
- [x] Dado cancelamento confirmado, quando recarregar, então item segue no histórico como cancelado e horário não aparece como ocupado pela consulta.
- [x] Dado dependente sem vínculo, quando forçar URL/ID, então nenhum detalhe é exibido e API nega.

## 6. Testes esperados
Prazo, rebooking/cancelamento, conflito, histórico, dependente/IDOR, estados e 360 px; lint.

## 7. Definition of Done
- [x] Fluxo usa FE-004/012 e contrato único, sem estado otimista incorreto.
- [x] Testes/lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
Texto/canal de contato da recepção depende da configuração operacional da clínica, sem número inventado na spec.

## Evidência local — 13/11/2026

Abas/view, paginação, sujeitos vinculados, detalhe/origem, prazo P-41 com expiração em tela e diálogos acessíveis implementados; busca FE-012 preserva especialidade/tipo original. Cancelamento/remarcação só atualizam após200 válido, nonce escopado e expectedVersion; conflitos preservam original. Resposta perdida orienta conferir a lista antes de repetir. Recibo FE-013 agora tem caminho Minhas consultas.

Firefox com API simulada9/9 específicas; regressão37/37, seguida de17/17 dos fluxos afetados pela mensagem de rede; nonce3/3; lint backend216/front72 e build Next aprovados. Escape/restauração do foco, prazo aberto, cancelamento após recarga, paginação/dependente, erro/ID arbitrário e360px cobertos. Primeira36/37 corrigiu apenas locator do card oculto pela modalidade. Conferência visual360px feita. Liberação real do horário/IDOR verificados no PostgreSQL por BE-022/023/P-41, não pelo mock de browser. Leitura original38 linhas da primeira à última; revisão manual de leitor de tela/ensaio com usuários permanece. Sem tsc/commit.
