# FE-002 - Primitives, estados e acessibilidade de base

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-001
- **Requisitos cobertos:** UI-002, UI-006, UI-007, UI-012, UI-013, UI-015, RNF-003, RNF-021

## 1. Objetivo
Entregar componentes reutilizáveis para formulários, feedback e estados, de forma consistente com o design system e acessível a telas do paciente.

## 2. Escopo
- Inclui: Button/Input/Label/Help/Error/Badge/Card/feedback, estados loading/vazio/erro/sucesso, focus/disabled/hover e base de Dialog/Sheet quando necessária.
- NÃO inclui: formulários de domínio ou agenda/prontuário específicos.

## 3. Contexto necessário
Ler `specs/frontend/design-system.md` (“Componentes e estados”; “Acessibilidade”), Design System §§11–13/19/21–24/29–34, `apps/frontend/AGENTS.md` e RNF-003/RNF-021 do inventário.

## 4. Detalhamento
- Reutilizar Shadcn/Base UI existente; `components/ui/button.tsx` tem default `h-9`, enquanto ações de produto requerem 44–48 px. Ajustar variantes usadas sem quebrar tamanhos compactos de contexto. Inputs 44 px, label persistente, help text e erro associados por ARIA.
- Badges combinam texto, cor e ícone quando crítico; cards têm borda/radius/sombra discreta; ações destrutivas usam `destructive`. Evitar informação essencial só em hover, movimento ornamental clínico e placeholder como label. Motion respeita tokens e movimento reduzido.
- Componentes de estado exibem causa e caminho de resolução em pt-BR; loading/empty/error/disabled/hover/focus/success têm aparência e semântica acessíveis. Não expor código interno de API diretamente.

## 5. Critérios de aceite
- [ ] Dado formulário com erro, quando foco navegar por teclado, então label/erro são anunciados e foco visível.
- [ ] Dado status clínico, quando remover cor (escala de cinza/leitor), então texto/ícone ainda comunicam estado.
- [ ] Dado botão primário de produto, quando medir área de interação, então altura respeita 44–48 px sem alterar variante compacta intencional.
- [ ] Dado erro de API, quando mostrar feedback, então texto indica causa em linguagem natural e próxima ação.

## 6. Testes esperados
Verificação de teclado/leitor de tela, contraste WCAG 2.1 AA em uso do paciente e estados de componente; lint do frontend.

## 7. Definition of Done
- [ ] Biblioteca única sem duplicatas divergentes; documentação de uso em design system respeitada.
- [ ] Estados e acessibilidade conferidos; lint passa, sem `tsc`.
- [ ] Nenhuma tela de domínio implementada nesta spec.

## 8. Suposições e pontos em aberto
Escolha entre Dialog/Sheet por viewport é decisão de composição de cada tela; componente base não presume fluxo clínico.
