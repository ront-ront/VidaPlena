# FE-001 - Tokens, fontes e alternância de tema

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** implementada localmente
- **Depende de:** nenhuma
- **Requisitos cobertos:** UI-001, UI-003, UI-004, UI-005, UI-014, UI-016, RNF-020

## 1. Objetivo
Fixar a identidade visual e tema claro/escuro em um único CSS antes das telas, aproveitando os tokens já presentes no repositório.

## 2. Escopo
- Inclui: conferência/complementação de tokens, Poppins/Inter, tema persistido `vp-theme`, idioma `pt-BR` e checagem de contraste base.
- NÃO inclui: telas de produto, botões/campos base (FE-002) ou troca de paleta aprovada.

## 3. Contexto necessário
Ler `specs/00-constitution.md`, `specs/frontend/design-system.md` (“Princípio visual”, “Tokens”, “Tipografia”), `apps/frontend/AGENTS.md`, Design System §§3–10/25–27 e documentação local Next.js indicada em `apps/frontend/AGENTS.md`.

## 4. Detalhamento
- `apps/frontend/src/app/globals.css` já contém primitivas e tokens semânticos light/dark; comparar valores com `frontend/design-system.md`, completar só faltantes. Não usar cor hardcoded em novos componentes quando há token. Preservar alvos de Tailwind/Shadcn.
- `layout.tsx` já carrega Inter/Poppins, mas HTML usa `lang="en"`; ajustar para `pt-BR`. Conferir peso Poppins 500 previsto no design system. Tema escuro é classe `dark` em `<html>`; alternador claro/escuro armazena `vp-theme` e restaura preferência antes do primeiro paint quando viável.
- Estado inicial, foco e contraste de texto/fundo devem ser legíveis em ambos temas; menta não mapeia para sucesso.

## 5. Critérios de aceite
- [x] Dado CSS atual, quando comparar tokens com o design system, então nenhum token obrigatório falta ou diverge sem decisão registrada.
- [x] Dado `vp-theme=dark`, quando recarregar, então tema escuro reaparece sem piscar em claro e `lang` é pt-BR.
- [x] Dado alternador, quando escolher claro/escuro, então preferência persiste e foco é visível por teclado.
- [x] Dado componente comum, quando inspecionar, então papel semântico usa token semântico, não cor de marca indevida.

## 6. Testes esperados
Verificação visual/manual dos dois temas e recarga; lint do frontend. Sem teste espelho de variável CSS.

## 7. Definition of Done
- [x] CSS/layout/alternador limitados a fundação; valores documentados conferidos.
- [x] Tema e idioma verificados; `yarn workspace vida-plena-frontend lint` passa, sem `tsc`.
- [x] Não adicionar variação de componente fora de FE-002.

## 8. Suposições e pontos em aberto
O CSS atual já possui as cores principais; Q-13 manda adicionar só se faltar. Configuração exata para evitar flash depende da API Next.js instalada, que deve ser consultada localmente.

## Evidência de implementação

Em 30/10/2026, tokens primitivos e semânticos conferidos com o Design System §§3–10/25–27; nenhum tom obrigatório faltava. `layout.tsx` carrega Poppins 500/600/700, define `pt-BR` e injeta script síncrono constante no `<head>`; o HTML gerado confirma sua posição antes do `<body>`, aplicando `vp-theme` antes da primeira pintura do conteúdo. O alternador acessível tem ações Claro/Escuro, persiste a escolha e sincroniza outras abas. No Firefox headless, recarga com `vp-theme=dark` manteve a classe escura; ambas ações trocaram classe e armazenamento. Tecla Tab focou “Tema claro” com ring visível de 2 px. Pares semânticos de texto/fundo medidos em claro e escuro ficaram acima de 4,5:1. Lint e build do frontend aprovados. Não houve captura em vídeo do primeiro paint; a ausência de flash decorre da ordem síncrona do HTML.
