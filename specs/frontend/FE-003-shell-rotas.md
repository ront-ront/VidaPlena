# FE-003 - Shell responsivo, navegação e rotas por perfil

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-001, FE-002, BE-005
- **Requisitos cobertos:** UI-001, UI-008, UI-011, UI-015, RNF-018, RNF-019, RNF-020

## 1. Objetivo
Criar estrutura de navegação por papel com orientação clara e responsividade, sem prometer telas de milestones futuros antes de existirem.

## 2. Escopo
- Inclui: layout App Router, sidebar/topbar, navegação mobile, 404/403 visual, estados do shell e marcação de rota ativa.
- NÃO inclui: autorização no servidor (BE-005), conteúdo das páginas de agenda/prontuário ou cliente HTTP (FE-004).

## 3. Contexto necessário
Ler `specs/frontend/design-system.md` (“Layout”), `specs/frontend/screens-map.md`, `specs/shared/access-policy.md`, Design System §§14/17.2/20 e documentação Next.js local exigida por `apps/frontend/AGENTS.md`.

## 4. Detalhamento
- Sidebar desktop sticky 280 px; a 1050 px, 220 px; a 760 px, esconder sidebar e oferecer navegação alternativa acionável por teclado. Item ativo usa `secondary` e texto/peso. Topbar mostra local, ação principal e usuário; não inserir dados clínicos em shell global.
- Rotas públicas/protegidas conforme `screens-map.md`; exibir só destinos implementados e autorizados no lote atual. Front route guard redireciona visualmente; API sempre revalida. 404/403 não revelam existência de prontuário alheio.
- Em 360 px, shell do paciente sem rolagem horizontal do viewport, mantendo foco, texto e ação principal. Tabelas operacionais futuras podem ter scroll em contêiner próprio.

## 5. Critérios de aceite
- [ ] Dado usuário de cada papel, quando abrir shell, então vê apenas destinos permitidos e a rota atual está identificada.
- [ ] Dada largura 360 px, quando navegar como paciente, então ação principal funciona sem scroll horizontal do viewport.
- [ ] Dado teclado/leitor de tela, quando abrir/fechar navegação mobile, então foco e rótulos permitem usar todos os destinos ativos.
- [ ] Dada rota desconhecida/proibida, quando abrir, então feedback em pt-BR é claro sem vazar dado clínico.

## 6. Testes esperados
Navegação por papel/rota ativa, viewport 360/760/1050, teclado e estados 403/404; lint.

## 7. Definition of Done
- [ ] Shell pronto para adicionar rotas sem duplicar layout.
- [ ] Destinos de milestones futuros não levam a tela vazia fictícia; lint passa, sem `tsc`.
- [ ] Segurança de servidor continua em BE-005.

## 8. Suposições e pontos em aberto
Rotas do `screens-map.md` são propostas técnicas Q-14. Sidebar do Design System é demonstração operacional; adaptação do portal do paciente é proposta visual fiel aos tokens.
