<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:visual-design-agent-rules -->

# Agent Instructions — Visual Design

### This file contains agent instructions for visual design.

# Regra de Layout e UI

Ao criar ou modificar layouts, mantenha a interface **moderna, minimalista, bonita, funcional, responsiva e fácil de entender**.

O design deve ter qualidade visual de produto profissional, seguindo boas práticas dos melhores design systems do mercado, mas sempre respeitando o estilo já existente no projeto.

## Referências de Design Systems

Use como inspiração, quando fizer sentido:

- **Material Design — Google:** boas práticas de hierarquia, componentes, estados e acessibilidade.
- **Human Interface Guidelines — Apple:** clareza, minimalismo, fluidez e experiência intuitiva.
- **Fluent Design System — Microsoft:** interfaces modernas, produtivas e bem estruturadas.
- **Carbon Design System — IBM:** ótimo para dashboards, sistemas robustos, acessibilidade e consistência.
- **Atlassian Design System:** excelente referência para produtos SaaS, organização visual e produtividade.
- **Shopify Polaris:** muito bom para interfaces de gestão, e-commerce, cards, formulários e fluxos administrativos.
- **Adobe Spectrum:** referência para sistemas flexíveis, profissionais e com boa documentação visual.
- **GitHub Primer:** ótimo para interfaces técnicas, dashboards, estados, navegação e componentes simples.
- **Vercel Geist:** boa inspiração para interfaces minimalistas, modernas, limpas e focadas em desenvolvedores.
- **GlueStack/ui:** principal referência prática para componentes no projeto.
  Não copie estilos diretamente. Use essas referências apenas para melhorar hierarquia, espaçamento, consistência, acessibilidade e acabamento visual.

## Estilo visual

Use uma estética limpa, elegante e profissional, com:

- boa hierarquia visual;
- espaçamentos consistentes;
- alinhamento preciso;
- cards bem estruturados;
- bordas suaves;
- sombras sutis;
- transições discretas;
- boa legibilidade;
- poucos elementos visuais desnecessários.

Evite interfaces genéricas, poluídas, desalinhadas, antigas ou com excesso de cores e efeitos.

## Cores

Siga principalmente as cores definidas no `global.css`:

```css

```

Use também as cores padrão do Tailwind quando fizer sentido, principalmente para tons neutros, bordas, backgrounds, textos, estados e variações semânticas.

## UX

Cada tela deve deixar claro:

- onde o usuário está;
- qual informação é mais importante;
- qual é a ação principal;
- o que pode ser feito em seguida.

Sempre trate estados de loading, empty, error, disabled, hover e focus quando aplicável.

<!-- END:visual-design-agent-rules -->
