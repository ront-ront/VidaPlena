# FE-010 - Gestão de especialidades, profissionais e salas

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-003, FE-004, BE-016, BE-017
- **Requisitos cobertos:** RF-028, RF-007

## 1. Objetivo
Dar a gestor/admin uma tela única para manter a oferta clínica e as salas físicas, com revisão antes de inativar recursos usados por consultas futuras.

## 2. Escopo
- Inclui: `/gestao/catalogo`, seções de especialidades, profissionais e salas, criação/edição/inativação e estados.
- NÃO inclui: grade (FE-011), agenda do dia (FE-015), exclusão física ou equipamento.

## 3. Contexto necessário
Ler `specs/frontend/design-system.md`, `specs/frontend/screens-map.md` (M1), `specs/shared/api-contracts.md#m1` (catálogo/salas), `specs/shared/access-policy.md`, DRS §3.5.1 e Q-07/Q-14.

## 4. Detalhamento
- Layout proposto Q-14: título/ação principal, tabs ou seções claras para Especialidades, Profissionais e Salas; busca/filtros; tabela com nome, modalidade, duração/status; formulário em painel com labels/erros. Especialidade exibe durações primeira/retorno; profissional mostra conselho/UF/número e especialidades; sala mostra nome/status/capacidade unitária.
- Inativação abre revisão de consultas futuras afetadas, com decisão explícita a resolver por RF-009/010 antes de aplicar. Sem botão Excluir. Usar serviços FE-004 para catálogo/admin; sala não é escolhida pelo paciente nem profissional.
- Loading, vazio com ação permitida, erro 409 de duplicidade/impacto, sucesso e estado sem permissão. Tabelas operacionais têm scroll próprio em mobile; controles acessíveis por teclado.

## 5. Critérios de aceite
- [ ] Dado gestor, quando editar duração/modalidade, então catálogo atualizado mostra novo valor e consulta antiga permanece com duração original.
- [ ] Dado profissional/sala com consulta futura, quando tentar inativar, então UI exibe impacto e não declara sucesso antes da resolução.
- [ ] Dado sala inativa ou registro duplicado, quando salvar, então erro em pt-BR mostra causa/ação e preserva campos válidos.
- [ ] Dado perfil sem gestão, quando forçar rota/serviço, então controles ausentes e API responde 403.

## 6. Testes esperados
Formulários por entidade, 409, inativação, permissão, estados e navegação teclado; lint front.

## 7. Definition of Done
- [ ] Componentes base FE-002 e serviços FE-004 reutilizados; layout proposto identificado.
- [ ] Estados/contratos/testes/lint conferidos, sem `tsc`.

## 8. Suposições e pontos em aberto
Lista inicial das oito especialidades não foi entregue; tela lista dados reais do catálogo, sem seed visual fictício. Resolução de consultas depende de FE-016/BE-022/023.
