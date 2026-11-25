# FE-018 - Check-in, atrasos e no-show na agenda

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; homologação manual pendente
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
- [x] Dada consulta do dia, quando recepção registrar chegada, então slot muda para Aguardando com horário e fila do profissional atualiza.
- [x] Dado atraso além de `appointment.late_tolerance_minutes`, quando abrir ação, então opções de decisão aparecem sem criar falta automática.
- [x] Dado prazo anterior a `appointment.noshow_after_minutes`, quando tentar marcar falta, então ação está indisponível e API rejeita tentativa forçada.
- [x] Dada falha da clínica/justificativa, quando registrar ou corrigir, então UI mostra classificação/histórico e não sugere penalidade indevida.
- [x] Dado fluxo iniciado na agenda, quando executar check-in, então acesso ocorre em até dois cliques e sem reload integral.

## 6. Testes esperados
Check-in, tolerâncias por chave, classificação/correção, fila, suspensão, dois cliques, teclado e estados; lint.

## 7. Definition of Done
- [x] FE-015/016/017 integradas sem duplicar autorização; texto/ícone além de cor.
- [x] Testes/lint passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Defaults de atraso/no-show são provisórios Q-16. Decisão de ausência permanece manual na V1.

## Evidência local —24/11/2026

9/9 Firefox com API simulada e11/11 integrações HTTP/PostgreSQL de ausência, incluindo P-53/histórico, aprovados. Chegada em dois cliques, prazo do servidor, filtro de conferência, classificação/correção com justificativa/versão, histórico, papéis, erro409/rede sem sucesso falso,360px/foco e duplo evento cobertos. Logs `/tmp/vidaplena-{arrivals-final-browser,history-final-backend}.log`. Nenhum prazo de política copiado no front. Fila real permanece coberta por BE-026; ensaio manual com usuários/leitor de tela não é comprovado por automação. Sem tsc/commit.

**Auditoria final M1:** regressão124/124 Firefox e revisão posterior52/52 (FE-01811, FE-0199, FE-02010, termos22), backend160/160 com saída0, cliente7/7, nonce3/3, fuso3/3, lint e build aprovados. Resultados sobrepostos não devem ser somados como uma única execução. FE-018 restringe decisões de atraso à recepção em atendimento aguardando. Evidências e limites em `../_work/11-m1-completion-audit.md`.
