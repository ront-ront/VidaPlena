# FE-015 - Agenda operacional da recepção

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** leitura operacional implementada localmente; agendar/remarcar/cancelar integrados por FE-016; check-in integra FE-018 e ensaio com usuários pendente
- **Depende de:** FE-003, BE-021, BE-026, BE-027
- **Requisitos cobertos:** RF-006, RF-014, RF-015, RNF-002, RNF-004, UI-009, UI-011

## 1. Objetivo
Entregar a tela de agenda diária da recepção com leitura rápida de ocupação, status e acesso imediato às ações operacionais.

## 2. Escopo
- Inclui: `/agenda`, topbar, busca, cards de contagem, grade e pontos de entrada para ações FE-016/018.
- NÃO inclui: formulário de agendar/reagendar (FE-016), lógica de check-in/no-show (FE-018) ou prontuário.

## 3. Contexto necessário
Ler `apps/frontend/docs/VidaPlena_Design_System.md` §§17/20/31, `specs/frontend/design-system.md` (Agenda/layout), `specs/frontend/screens-map.md`, `specs/shared/api-contracts.md#m1` (`GET /agenda/day`), DRS §§3.2.9–10 e RNF-002/004.

## 4. Detalhamento
- **Layout de origem:** sidebar operacional; topbar com título, data e busca por paciente; cards “Consultas hoje”, “Confirmadas” e “No-show”; grade com coluna de hora fixa e colunas por especialidade/profissional, slots coloridos por contexto/status **com texto**. Não fixar números de exemplo 198/174/7 como dados reais. Densidade privilegia scanning sem esconder alertas.
- Ações Agendar/Reagendar/Cancelar/Check-in devem ser alcançadas a partir da agenda em até dois cliques, sem recarga completa, mediante menus/botões acessíveis que abrem FE-016/018. Busca/filtros/data preservam contexto; status de contato manual, atraso, encaixe e origem importada aparecem sem conteúdo clínico.
- Loading usa skeleton da grade, vazio do dia sugere mudar data, erro oferece tentar de novo; atualização após mutação preserva foco/filtro e anuncia mudança. Em ≤760 px, sidebar some e grade rola **dentro** de contêiner com largura mínima 620 px, sem esmagar slots; tablet permanece utilizável.

## 5. Critérios de aceite
- [x] Dado dia com consultas, quando abrir, então topbar, três cards e grade hora/especialidade/status correspondem ao contrato sem números mockados.
- [ ] Dada ação comum, quando partir da agenda, então formulário/ação está acessível em até dois cliques e sem reload da página.
- [x] Dado 760 px ou menos, quando abrir, então grade mantém largura mínima 620 px com scroll próprio e controles continuam acessíveis por teclado.
- [x] Dado erro/vazio/atualização, quando ocorrer, então há mensagem acionável, contexto mantido e status comunicado além de cor.
- [ ] Dada sessão de treinamento de uma hora, quando avaliar recepção, então 90% executam as quatro tarefas RNF-004 sem auxílio; evidência é ensaio com usuários, não lint.

## 6. Testes esperados
Layout visual fiel §§17/31, busca/data/filtros, dois cliques, estados, 760/1050 px, teclado e ensaio RNF-004 com FE-016/018; lint.

## 7. Definition of Done
- [x] Origem visual citada e componentes FE-002 usados; dados mínimos autorizados.
- [ ] Testes/lint passam; ensaio de usabilidade registrado quando executado, sem `tsc`.

## 8. Suposições e pontos em aberto
A grade do Design System exemplifica especialidades e números; usar catálogo/dados reais. RNF-004 só pode ser encerrado após teste com participantes e treinamento.

## Evidência local — 13/11/2026

Layout de origem §§17/20/31 aplicado a dados reais da API: dia/fuso do servidor, busca/filtros, totais, hora fixa, colunas por especialidade/profissional, flags textuais, paginação e detalhes administrativos. Células vazias não prometem disponibilidade. Filtro inválido não envia requisição; erro/atualização preservam data/busca. Navegação resolve rota mais específica para não bloquear grade profissional.

Firefox7/7 específicas aprovadas, incluindo760px/teclado/scroll próprio; regressão anterior43/44 com37/37 anteriores aprovados e única falha em fixture de rolagem (duas colunas cabiam em760px); fixture passou a carregar terceira coluna e sete testes finais passaram. Não declarar44/44 como uma execução única. Lint backend216/front76 e build Next aprovados, sem tsc/commit. Backend147/147 integrações aprovado após P-41/P-43. Captura760px inspecionada. Arquivo original39 linhas lido integralmente; detalhe232 linhas ManageArrivals lido completo. Ações de FE-016/018 e teste de dois cliques/treinamento continuam pendentes, sem controles simulados.

Integração FE-016 concluída: Novo atendimento e ações nos detalhes abrem painéis em até dois cliques, preservam data/filtros/foco após sucesso. Regressão54/54+revisão1/1, lint/build aprovados. Check-in/no-show continuam FE-018; ensaio com pessoas permanece pendente.
