# VidaPlena Design System — Especificação para IA

> **Versão:** 1.0  
> **Origem:** `VidaPlena Design System — Shadcn + ScrollX UI`  
> **Idioma do produto:** pt-BR  
> **Objetivo deste documento:** servir como fonte de verdade para IAs, designers e desenvolvedores ao criar ou revisar interfaces do VidaPlena.

---

> **Nota de proveniência:** as seções de tokens, valores, componentes, exemplos, responsividade e implementação reproduzem/estruturam informações do HTML de origem. As seções finais de “regras para IA”, checklist e prompt-base são uma normalização operacional dessas mesmas decisões para facilitar o uso por modelos de IA; elas não introduzem uma nova paleta ou um segundo design system.

## 1. Visão geral

O **VidaPlena Design System** define uma linguagem visual clínica, humana e operacional. O sistema foi estruturado para aplicações com alta densidade de informação e compatibilidade com:

- Shadcn/ui
- ScrollX UI
- Tailwind CSS
- Light mode e dark mode
- Interfaces clínicas e administrativas
- Aplicações desktop responsivas para tablet/mobile

A proposta visual equilibra:

- **Confiança** por meio de azul profundo.
- **Cuidado e conexão** por meio de verde menta.
- **Acolhimento** por meio de neutros quentes/creme.
- **Tecnologia e teleconsulta** por meio de lilás.
- **Alta legibilidade e densidade operacional** em telas clínicas.
- **Movimento discreto**, sem competir com tarefas críticas.

### 1.1 Princípio de distribuição visual

Usar aproximadamente:

| Família | Proporção sugerida |
|---|---:|
| Neutros | 70% |
| Azul | 15% |
| Menta | 10% |
| Lilás | 5% |

Essa distribuição deve ser entendida como regra de equilíbrio visual, não como cálculo rígido por tela.

---

# 2. Direção visual

## 2.1 Confiança

O azul profundo representa:

- confiança;
- institucionalidade;
- navegação;
- ações primárias;
- estados importantes do produto.

Ações primárias devem preferencialmente utilizar `primary` ou tons profundos da família **Vida Blue**.

## 2.2 Humano / cuidado / conexão

O menta representa:

- cuidado;
- conexão;
- sensação humana;
- assinatura visual da marca.

O menta **não deve dominar interfaces operacionais**. Ele funciona como destaque, acento ou assinatura visual.

## 2.3 Acolhimento

Grandes superfícies devem utilizar neutros quentes em vez de branco frio sempre que possível.

O canvas claro principal usa `#F8F5EE`, criando sensação mais acolhedora e reduzindo fadiga visual.

## 2.4 Tecnologia / teleconsulta

O lilás é uma cor terciária. Deve ser reservado principalmente para:

- teleconsulta;
- inovação;
- recursos tecnológicos;
- apoio visual;
- diferenciação de especialidades ou contextos auxiliares.

---

# 3. Paleta primitiva de cores

## 3.1 Vida Blue

| Token | Hex |
|---|---|
| `brand-blue-50` | `#EFF7FB` |
| `brand-blue-100` | `#DCECF5` |
| `brand-blue-200` | `#BBD9E9` |
| `brand-blue-300` | `#91C0D8` |
| `brand-blue-400` | `#6AA7C8` |
| `brand-blue-500` | `#5091BC` |
| `brand-blue-600` | `#397EAA` |
| `brand-blue-700` | `#256996` |
| `brand-blue-800` | `#0C4E80` |
| `brand-blue-900` | `#0A416B` |
| `brand-blue-950` | `#062B47` |

### Uso recomendado

- 50–200: fundos leves, superfícies, hover suave.
- 300–500: ilustrações, destaques e elementos secundários.
- 600–700: interações e estados intermediários.
- 800: ação primária padrão no light mode.
- 900–950: texto sobre tons claros, estados profundos e contraste forte.

---

## 3.2 Vida Mint

| Token | Hex |
|---|---|
| `brand-mint-50` | `#ECFBF7` |
| `brand-mint-100` | `#D4F6EC` |
| `brand-mint-200` | `#A9ECD9` |
| `brand-mint-300` | `#7CDEC4` |
| `brand-mint-400` | `#50D6B2` |
| `brand-mint-500` | `#4AC3A2` |
| `brand-mint-600` | `#2FAE8D` |
| `brand-mint-700` | `#218A70` |
| `brand-mint-800` | `#196C59` |
| `brand-mint-900` | `#155748` |
| `brand-mint-950` | `#0B332A` |
| `brand-mint-highlight` | `#38D5A8` |

### Uso recomendado

- assinatura visual da marca;
- acentos;
- superfícies de destaque;
- conexão/cuidado;
- decoração discreta;
- gradientes da marca.

> **Importante:** menta de marca não deve ser tratado automaticamente como `success`.

---

## 3.3 Vida Lilac

| Token | Hex |
|---|---|
| `brand-lilac-50` | `#FAF8FD` |
| `brand-lilac-100` | `#F2EDF8` |
| `brand-lilac-200` | `#E5DFED` |
| `brand-lilac-300` | `#D4C9E5` |
| `brand-lilac-400` | `#BEAFD9` |
| `brand-lilac-500` | `#A493CB` |
| `brand-lilac-600` | `#8874B5` |
| `brand-lilac-700` | `#6F5B99` |
| `brand-lilac-800` | `#584978` |
| `brand-lilac-900` | `#473C61` |
| `brand-lilac-950` | `#2D263F` |

### Uso recomendado

- teleconsulta;
- inovação;
- atendimento em andamento;
- diferenciação auxiliar;
- superfícies tecnológicas.

---

## 3.4 Warm Neutral

| Token | Hex |
|---|---|
| `neutral-0` | `#FFFFFF` |
| `neutral-25` | `#FCFBF7` |
| `neutral-50` | `#F8F5EE` |
| `neutral-100` | `#F3EFE5` |
| `neutral-200` | `#E7E1D6` |
| `neutral-300` | `#D3CDC2` |
| `neutral-400` | `#AEA89F` |
| `neutral-500` | `#858078` |
| `neutral-600` | `#625F5A` |
| `neutral-700` | `#464541` |
| `neutral-800` | `#2F302E` |
| `neutral-900` | `#1E201F` |
| `neutral-950` | `#121413` |

### Uso recomendado

- grandes superfícies;
- fundo de página;
- cards;
- bordas;
- texto;
- conteúdo secundário;
- separadores.

---

# 4. Tokens semânticos

Componentes **não devem depender diretamente** de tokens como `blue-800` quando estiverem representando papéis de interface.

Preferir tokens semânticos como:

- `background`
- `foreground`
- `card`
- `primary`
- `secondary`
- `accent`
- `muted`
- `destructive`
- `border`
- `input`
- `ring`

Isso permite consistência entre Shadcn, ScrollX UI, light mode e dark mode.

---

## 4.1 Light mode

| Token | Valor | Uso |
|---|---|---|
| `background` | `#F8F5EE` | Canvas geral |
| `foreground` | `#1E201F` | Texto principal |
| `card` | `#FFFFFF` | Cards e superfícies |
| `card-foreground` | `#1E201F` | Texto em cards |
| `popover` | `#FFFFFF` | Popovers |
| `popover-foreground` | `#1E201F` | Texto em popovers |
| `primary` | `#0C4E80` | Ações principais |
| `primary-foreground` | `#FFFFFF` | Conteúdo sobre primary |
| `secondary` | `#EFF7FB` | Ações secundárias |
| `secondary-foreground` | `#0C4E80` | Conteúdo sobre secondary |
| `muted` | `#F3EFE5` | Superfície discreta |
| `muted-foreground` | `#625F5A` | Texto secundário |
| `accent` | `#ECFBF7` | Containers de destaque |
| `accent-foreground` | `#155748` | Conteúdo sobre accent |
| `destructive` | `#C4313C` | Ações destrutivas |
| `destructive-foreground` | `#FFFFFF` | Texto sobre destructive |
| `border` | `#D3CDC2` | Bordas |
| `input` | `#D3CDC2` | Bordas de inputs |
| `ring` | `#397EAA` | Focus ring |
| `radius` | `0.75rem` | Raio base |

---

## 4.2 Dark mode

| Token | Valor |
|---|---|
| `background` | `#0E1A21` |
| `foreground` | `#F7FAFC` |
| `card` | `#152630` |
| `card-foreground` | `#F7FAFC` |
| `popover` | `#1B303C` |
| `popover-foreground` | `#F7FAFC` |
| `primary` | `#6AA7C8` |
| `primary-foreground` | `#07131A` |
| `secondary` | `#1B303C` |
| `secondary-foreground` | `#DCECF5` |
| `muted` | `#1B303C` |
| `muted-foreground` | `#C0CAD0` |
| `accent` | `#15372F` |
| `accent-foreground` | `#A9ECD9` |
| `destructive` | `#E76670` |
| `destructive-foreground` | `#1A0B0D` |
| `border` | `#334B59` |
| `input` | `#334B59` |
| `ring` | `#91C0D8` |

### Regras do dark mode

- Não apenas inverter cores.
- Preservar hierarquia entre background, card e popover.
- Usar azul mais claro para `primary`, garantindo visibilidade sobre fundos escuros.
- Manter menta e azul suavizados para não gerar brilho excessivo.

---

# 5. Estados de interface

## 5.1 Cores de status

| Estado | Foreground | Background |
|---|---|---|
| Informação | `#1F668F` | `#EDF7FC` |
| Sucesso / confirmado | `#0F5F43` | `#EAF8F1` |
| Aviso / aguardando | `#7A4300` | `#FFF4DB` |
| Erro / cancelado | `#9E2630` | `#FDECEF` |
| Neutro / finalizado | `#475A67` | `#EFF3F5` |

### Regras de status

1. Marca e status são conceitos separados.
2. O menta institucional não equivale automaticamente a sucesso.
3. Nunca comunicar informação clínica somente por cor.
4. Sempre que necessário, combinar:
   - cor;
   - texto;
   - ícone;
   - rótulo explícito.

---

# 6. Paleta para especialidades

O sistema apresenta 8 combinações para diferenciar especialidades/contextos:

| Especialidade | Foreground | Background |
|---|---|---|
| Specialty 01 | `#1F668F` | `#E7F4FA` |
| Specialty 02 | `#14755D` | `#E6FAF3` |
| Specialty 03 | `#6F5B99` | `#F2EDF8` |
| Specialty 04 | `#236F7F` | `#E6F6F9` |
| Specialty 05 | `#495BA8` | `#EEF0FC` |
| Specialty 06 | `#8B466C` | `#FAEDF4` |
| Specialty 07 | `#9C5B00` | `#FFF2DD` |
| Specialty 08 | `#475A67` | `#EFF3F5` |

Essas cores devem funcionar como categorias auxiliares. Não devem substituir rótulos textuais.

---

# 7. Gradientes da marca

## 7.1 Gradiente principal

```css
linear-gradient(
  135deg,
  #0C4E80 0%,
  #5091BC 52%,
  #4AC3A2 100%
)
```

## 7.2 Gradiente do texto de destaque — light

```css
linear-gradient(
  110deg,
  var(--brand-blue-800),
  var(--brand-blue-500) 48%,
  var(--brand-mint-500)
)
```

## 7.3 Gradiente do texto de destaque — dark

```css
linear-gradient(
  110deg,
  #91C0D8,
  #6AA7C8 48%,
  #7CDEC4
)
```

Gradientes são apropriados para:

- branding;
- hero;
- destaques institucionais;
- elementos de identidade.

Evitar gradientes como fundo de áreas clínicas densas ou controles críticos.

---

# 8. Tipografia

## 8.1 Famílias tipográficas

### Poppins

Usar em:

- headings;
- títulos de maior impacto;
- branding;
- títulos de página;
- chamadas institucionais.

Pesos carregados no HTML:

- 500
- 600
- 700

### Inter

Usar em:

- corpo de texto;
- labels;
- dados;
- agenda;
- prontuário;
- tabelas;
- formulários;
- interfaces densas.

Pesos carregados no HTML:

- 400
- 500
- 600
- 700

### Stack padrão

```css
body {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}

h1,
h2,
h3,
h4,
.brand-font {
  font-family: Poppins, Inter, sans-serif;
}
```

---

## 8.2 Escala tipográfica

| Token | Família | Tamanho | Line-height | Peso |
|---|---|---:|---:|---:|
| `display.lg` | Poppins | 48px | 56px | 700 |
| `heading.h1` | Poppins | 36px | 44px | 700 |
| `heading.h2` | Poppins | 30px | 38px | 700 |
| `heading.h3` | Poppins | 24px | 32px | 600 |
| `title.lg` | Inter | 20px | 28px | 600 |
| `body.lg` | Inter | 16px | 24px | 400 |
| `body.md` | Inter | 14px | 20px | 400 |
| `label.md` | Inter | 12px | 16px | 600 |

### Regras tipográficas

- Interfaces operacionais devem priorizar Inter.
- Poppins deve reforçar hierarquia e marca, não ser usado indiscriminadamente em tabelas ou formulários.
- Labels podem usar caixa alta quando fizer sentido, com boa legibilidade.
- Textos secundários usam `muted-foreground`.

---

# 9. Geometria

## 9.1 Grid de spacing

A base é de **4px**.

| Token | Valor |
|---|---:|
| `space.1` | 4px |
| `space.2` | 8px |
| `space.3` | 12px |
| `space.4` | 16px |
| `space.6` | 24px |
| `space.8` | 32px |
| `space.12` | 48px |

### Regra

Sempre que possível, paddings, gaps, margens e distâncias entre elementos devem se apoiar nessa escala.

---

## 9.2 Border radius

| Nome | Valor |
|---|---:|
| `sm` | 6px |
| `md` | 10px |
| `xl` | 16px |
| `2xl` | 24px |
| `radius` semântico | `0.75rem` = 12px |

### Padrões observados

- Botões: aproximadamente 11px.
- Inputs: 10px.
- Cards principais: 16px.
- Containers maiores: 16–20px.
- Pills e badges: `999px`.

O visual deve ser arredondado, mas não excessivamente “fofo”. A interface continua operacional.

---

# 10. Elevação e sombras

```css
--shadow-1: 0 1px 2px rgb(18 20 19 / .06);
--shadow-2: 0 4px 12px rgb(18 20 19 / .10);
--shadow-3: 0 12px 32px rgb(18 20 19 / .14);
```

### Uso sugerido

- `shadow-1`: cards e superfícies comuns.
- `shadow-2`: elementos em destaque, mini apps, logo e superfícies elevadas.
- `shadow-3`: overlays ou superfícies com forte separação visual.

Sombras devem permanecer discretas.

---

# 11. Motion

O ScrollX UI pode ser utilizado como camada de movimento, mas a experiência clínica deve permanecer calma.

> Motion orienta hierarquia. Motion não compete com a tarefa.

## 11.1 Tokens

| Token | Duração | Uso |
|---|---:|---|
| `motion.micro` | 120ms | Press, toggle, checkbox |
| `motion.interaction` | 150ms | Hover e focus |
| `motion.dropdown` | 180ms | Combobox e popover |
| `motion.sheet` | 220ms | Sheet lateral |
| `motion.modal` | 250ms | Dialog |
| `motion.page` | 250–300ms | Transição de contexto |

### Regras de motion

- Subtle by default.
- Evitar movimento ornamental em tarefas clínicas críticas.
- Usar motion para:
  - entrada contextual;
  - feedback de interação;
  - navegação;
  - hierarquia;
  - continuidade espacial.

---

# 12. Componentes base

## 12.1 Buttons

Altura recomendada: **44–48px**.

### Primary

```text
Background: primary
Foreground: primary-foreground
Border: transparente
Radius: ~11px
Font: 13px / 600
```

Uso:

- salvar;
- confirmar;
- finalizar;
- avançar em ações principais.

Exemplo: `Salvar consulta`.

### Secondary

```text
Background: secondary
Foreground: secondary-foreground
Border: border
```

Uso:

- ações secundárias;
- reagendamento;
- alternativa à ação primária.

Exemplo: `Reagendar`.

### Ghost

```text
Background: transparente
Foreground: brand-blue-700
```

Uso:

- navegação contextual;
- ações de menor ênfase.

Exemplo: `Ver histórico`.

### Danger / destructive

```text
Background: destructive
Foreground: destructive-foreground
```

Uso:

- cancelar;
- excluir;
- ações destrutivas.

Exemplo: `Cancelar`.

---

## 12.2 Input

Especificação visual:

```text
Height: 44px
Border: 1px solid input
Background: background
Foreground: foreground
Radius: 10px
Horizontal padding: 12px
```

### Focus

```css
border-color: var(--ring);
box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 20%, transparent);
```

### Regra importante

**Label nunca deve virar placeholder.**

Sempre manter label persistente acima do input quando o dado precisar de contexto inequívoco.

### Help text

- 11px;
- cor `muted-foreground`;
- aparece abaixo do campo;
- pode indicar regras, instruções ou contexto anterior.

Exemplo:

```text
Paciente
[ Mariana Oliveira ]
Busque por nome, CPF ou número do prontuário.
```

---

## 12.3 Campo médico

Unidades devem permanecer visíveis.

Exemplo:

```text
Peso
[ 72,5                 kg ]
Última medição: 71,8 kg em 12/08.
```

### Regras

- Não esconder a unidade dentro de placeholder.
- Exibir histórico quando útil.
- Preservar contexto clínico.
- Usar formatação local pt-BR quando aplicável.

---

## 12.4 Badges / status

Formato:

```text
Display: inline-flex
Padding: 6px 9px
Radius: 999px
Font size: 11px
Font weight: 700
```

Os badges possuem um pequeno indicador circular usando a própria cor do texto.

Estados demonstrados:

- Informação
- Confirmado
- Aguardando
- Em atendimento
- Finalizado
- Cancelado
- No-show
- Salvo

---

# 13. Cards e superfícies

## 13.1 Card padrão

```text
Background: card
Border: 1px solid border
Radius: 16px
Shadow: shadow-1
Padding: 20px
```

## 13.2 Card soft

Mistura `card` e `muted`, produzindo uma superfície com contraste suave.

## 13.3 Component card

```text
Background: card
Border: border
Radius: 16px
Padding: 22px
```

---

# 14. Layout estrutural

## 14.1 Shell desktop do design system

```text
Sidebar: 280px
Main: restante do viewport
Min-height: 100vh
```

A sidebar é sticky e ocupa 100vh.

### Sidebar

- padding: `24px 18px`;
- border-right;
- fundo baseado em `card` com transparência;
- backdrop blur de 14px;
- scroll vertical quando necessário.

### Navegação

Cada item:

- display flex;
- gap 10px;
- padding `9px 10px`;
- radius 9px;
- font-size 13px;
- font-weight 500;
- hover usando `muted`.

---

# 15. Brand mark

A marca apresentada no HTML utiliza um símbolo abstrato:

```text
Tamanho: 42 × 42px
Radius: 14px
```

Gradiente:

```css
linear-gradient(
  135deg,
  var(--brand-blue-800),
  var(--brand-blue-500) 52%,
  var(--brand-mint-500)
)
```

Possui um círculo interno com borda branca.

### Logotipo textual no mockup do produto

- `Vida` em azul (`brand-blue-500`).
- `Plena` em menta (`brand-mint-500`).
- Poppins 700.

---

# 16. Hero / apresentação institucional

O hero do design system usa:

- padding vertical amplo;
- gradientes radiais suaves;
- título grande com Poppins;
- texto da marca com gradiente azul → menta;
- descrição em `muted-foreground`;
- pills informativas.

Pills apresentadas:

- Shadcn-ready
- ScrollX-compatible
- Light + Dark
- WCAG-aware
- Clinical UX

Esse padrão é mais apropriado para documentação, onboarding ou marketing do que para áreas clínicas operacionais.

---

# 17. Agenda — modo operacional

A agenda foi projetada para cenários de alta densidade, exemplificando uma recepção com aproximadamente **200 pacientes por dia**.

## 17.1 Objetivos

Priorizar:

- densidade;
- scanning rápido;
- identificação de conflito de horários;
- leitura por especialidade;
- visualização rápida de status.

A interface voltada ao paciente pode ser mais espaçosa e confortável.

## 17.2 Estrutura da agenda

### Navegação lateral

Itens demonstrados:

- Agenda
- Pacientes
- Prontuários
- Teleconsulta
- Relatórios
- Configurações

O item ativo utiliza `secondary` + `secondary-foreground` e font-weight 700.

### Topbar

Contém:

- título da página;
- data;
- busca por paciente.

### Cards de estatísticas

Exemplos demonstrados:

- Consultas hoje: `198`
- Confirmadas: `174`
- No-show: `7`

Os valores de sucesso e erro podem usar as cores semânticas correspondentes.

### Grade da agenda

Colunas demonstradas:

- Hora
- Clínica
- Cardio
- Ortopedia
- Dermato

Horários demonstrados:

- 08:00
- 08:30
- 09:00
- 09:30

Slots utilizam superfícies coloridas por contexto/status.

---

# 18. Prontuário — modo clínico

No prontuário:

- ornamentação diminui;
- legibilidade aumenta;
- identificação do paciente permanece sempre clara;
- histórico deve ser escaneável;
- estado de salvamento deve ser explícito.

## 18.1 Header do paciente

Exibir:

- avatar/iniciais;
- nome;
- idade;
- número do prontuário;
- última consulta;
- alertas críticos.

Exemplo de alerta demonstrado:

```text
Alergia: Dipirona
```

Esse alerta usa estilo de warning.

## 18.2 Avatar

```text
44 × 44px
Circular
Gradiente brand-blue-200 → brand-mint-200
Texto brand-blue-900
```

## 18.3 Timeline clínica

A timeline usa:

- linha vertical azul clara;
- marcadores circulares;
- data em texto pequeno secundário;
- título do evento em negrito;
- descrição secundária.

Eventos demonstrados incluem:

- consulta de retorno;
- consulta inicial;
- exame laboratorial.

## 18.4 Evolução clínica

O painel contém:

- título;
- badge de estado de salvamento;
- textarea;
- botão secundário para salvar rascunho;
- botão primário para finalizar evolução.

### Regra essencial

O estado de persistência deve ser visível, por exemplo:

```text
Salvo
Salvando…
Erro ao salvar
Rascunho
```

O HTML exemplifica explicitamente `Salvo`.

---

# 19. Textarea

Especificação:

```text
Width: 100%
Min-height: 160px
Border: input
Radius: 12px
Background: background
Foreground: foreground
Padding: 12px
Resize: vertical
```

---

# 20. Responsividade

## 20.1 Breakpoint até 1050px

Alterações:

- sidebar reduz de 280px para 220px;
- paleta passa de 11 colunas para 6;
- grids de 4 colunas passam para 2;
- mini app reduz sidebar de 210px para 160px;
- especialidades passam de 4 para 2 colunas.

## 20.2 Breakpoint até 760px

Alterações:

- layout principal deixa de ser grid e vira bloco;
- sidebar principal é escondida;
- hero e conteúdo usam 20px nas laterais;
- grids 2, 3 e 4 colunas viram 1 coluna;
- componentes viram 1 coluna;
- patient layout vira 1 coluna;
- paleta vira 3 colunas;
- section header vira coluna;
- type samples viram coluna;
- mini app vira 1 coluna;
- mini sidebar é escondida;
- stat grid vira 1 coluna;
- agenda ganha scroll horizontal;
- grade da agenda mantém largura mínima de 620px;
- especialidades viram 1 coluna;
- hero h1 é limitado a 42px.

### Regra para IA

Em mobile, preservar legibilidade e fluxos essenciais. Para tabelas/agenda densas, preferir scroll horizontal ou vistas alternativas em vez de comprimir conteúdo até ficar ilegível.

---

# 21. Acessibilidade e UX clínica

O sistema se declara `WCAG-aware` e demonstra regras concretas:

1. Informação clínica não deve depender apenas da cor.
2. Status deve combinar texto e cor.
3. Labels devem permanecer explícitos.
4. Unidades de campos médicos devem estar visíveis.
5. Focus ring deve ser perceptível.
6. Estados de salvamento devem ser explícitos.
7. Motion deve ser discreto.
8. Interfaces clínicas devem priorizar legibilidade sobre ornamentação.
9. Texto secundário deve manter contraste adequado.
10. Dark mode deve preservar hierarquia e contraste.

---

# 22. Shadcn/ui

O design system recomenda utilizar Shadcn como camada de primitives de produto.

Componentes explicitamente citados:

- Button
- Input
- Dialog
- Sheet
- Tabs
- Data Table
- Calendar
- Command

### Diretriz

O código dos componentes permanece sob controle do projeto.

Usar tokens semânticos do VidaPlena para estilizar os primitives, em vez de substituir arbitrariamente as cores em cada componente.

---

# 23. ScrollX UI

Usar principalmente em:

- onboarding;
- waiting room;
- empty states;
- transições;
- dashboards;
- marketing.

Evitar motion ornamental durante:

- preenchimento de prontuário;
- decisões clínicas;
- campos críticos;
- tarefas operacionais de alta concentração.

---

# 24. Lucide Icons

O sistema recomenda Lucide com:

| Propriedade | Valores |
|---|---|
| Tamanhos | 16px, 20px, 24px, 32px |
| Stroke | ~1.75–2px |
| Estilo | Linear |

Ícones devem manter continuidade visual com o restante da interface.

---

# 25. Implementação CSS — base para globals.css

```css
:root {
  --radius: 0.75rem;

  --background: #f8f5ee;
  --foreground: #1e201f;
  --card: #ffffff;
  --card-foreground: #1e201f;
  --popover: #ffffff;
  --popover-foreground: #1e201f;

  --primary: #0c4e80;
  --primary-foreground: #ffffff;
  --secondary: #eff7fb;
  --secondary-foreground: #0c4e80;
  --muted: #f3efe5;
  --muted-foreground: #625f5a;
  --accent: #ecfbf7;
  --accent-foreground: #155748;

  --destructive: #c4313c;
  --destructive-foreground: #ffffff;
  --border: #d3cdc2;
  --input: #d3cdc2;
  --ring: #397eaa;

  --vida-blue: #5091bc;
  --vida-blue-deep: #0c4e80;
  --vida-mint: #4ac3a2;
  --vida-mint-highlight: #38d5a8;
  --vida-lilac: #e5dfed;
  --vida-cream: #f3efe5;
}

.dark {
  --background: #0e1a21;
  --foreground: #f7fafc;
  --card: #152630;
  --card-foreground: #f7fafc;
  --popover: #1b303c;
  --popover-foreground: #f7fafc;
  --primary: #6aa7c8;
  --primary-foreground: #07131a;
  --secondary: #1b303c;
  --secondary-foreground: #dcecf5;
  --muted: #1b303c;
  --muted-foreground: #c0cad0;
  --accent: #15372f;
  --accent-foreground: #a9ecd9;
  --destructive: #e76670;
  --destructive-foreground: #1a0b0d;
  --border: #334b59;
  --input: #334b59;
  --ring: #91c0d8;
}
```

---

# 26. Tokens adicionais de marca

```css
--vida-blue: #5091bc;
--vida-blue-deep: #0c4e80;
--vida-mint: #4ac3a2;
--vida-mint-highlight: #38d5a8;
--vida-lilac: #e5dfed;
--vida-cream: #f3efe5;
```

Esses tokens podem ser usados quando o papel é explicitamente de branding, e não semântico.

---

# 27. Comportamento de tema

O HTML implementa duas ações explícitas:

```text
Claro
Escuro
```

O tema escuro é ativado adicionando a classe `dark` ao elemento `<html>`.

A preferência é persistida em `localStorage` usando a chave:

```text
vp-theme
```

Valores usados:

```text
light
dark
```

Ao carregar a página, se `vp-theme === "dark"`, o dark mode é aplicado automaticamente.

---

# 28. Comportamento de cópia de código

A documentação possui um botão para copiar o snippet de CSS.

Fluxo:

1. obtém `innerText` do bloco;
2. escreve no clipboard;
3. altera temporariamente o texto do botão para `Copiado`;
4. após 1200ms restaura o texto original.

Esse comportamento pertence à documentação, não necessariamente ao produto clínico.

---

# 29. Regras para geração de interfaces por IA

Ao gerar novas telas para o VidaPlena, seguir estas regras em ordem de prioridade.

## 29.1 Cores

- Usar tokens semânticos para componentes comuns.
- Usar tokens `brand-*` somente quando houver intenção de branding/categoria.
- Não transformar menta em cor de sucesso automaticamente.
- Não criar novas cores sem necessidade.
- Manter o canvas warm neutral no light mode.
- Usar lilás com parcimônia.

## 29.2 Hierarquia

- Poppins em headings e marca.
- Inter em interface operacional.
- Títulos claros e concisos.
- Metadados e texto auxiliar em `muted-foreground`.
- Reduzir ornamentação conforme aumenta a criticidade da tarefa.

## 29.3 Componentes

- Botões e inputs principais com 44px de altura mínima no padrão demonstrado.
- Inputs sempre com label explícito.
- Campos clínicos devem mostrar unidades.
- Ações destrutivas devem usar `destructive`.
- Cards com border + radius, evitando sombras excessivas.

## 29.4 Estados

- Usar cor + texto.
- Em clínica, considerar também ícone quando houver risco de interpretação incorreta.
- Exibir estado de salvamento.
- Erros devem ser explícitos e acionáveis.

## 29.5 Layout

- Desktop pode ter alta densidade.
- Mobile deve reorganizar, não simplesmente reduzir tudo.
- Tabelas densas podem usar scroll horizontal.
- Manter base de spacing em 4px.

## 29.6 Motion

- Utilizar tokens definidos.
- Microinterações rápidas.
- Modais/transições no máximo por volta de 250–300ms.
- Evitar animação ornamental em tarefas clínicas.

## 29.7 Acessibilidade

- Não depender apenas de cor.
- Preservar contraste.
- Usar focus ring.
- Não remover labels.
- Garantir clareza em alertas clínicos.

---

# 30. Regras específicas para telas clínicas

Ao gerar agenda, prontuário, consulta ou atendimento:

1. Priorizar conteúdo sobre decoração.
2. Manter paciente claramente identificado.
3. Exibir status clínicos/textuais explicitamente.
4. Exibir unidades de medida.
5. Mostrar estado de salvamento.
6. Reduzir motion.
7. Evitar gradientes decorativos em áreas de leitura densa.
8. Usar cards apenas para agrupamento semântico.
9. Não esconder informações essenciais em hover.
10. Facilitar scanning rápido.

---

# 31. Regras específicas para agenda

- Otimizar para densidade e scanning.
- Exibir hora de forma fixa e previsível.
- Diferenciar especialidades sem depender exclusivamente da cor.
- Exibir conflitos com clareza.
- Permitir busca de paciente em destaque.
- Manter resumo operacional visível quando útil.
- Em telas estreitas, preservar largura útil da grade e usar scroll horizontal.

---

# 32. Regras específicas para prontuário

- Cabeçalho do paciente deve permanecer altamente reconhecível.
- Alertas importantes devem ficar próximos à identificação.
- Linha do tempo deve ser cronologicamente escaneável.
- Área de evolução deve ser ampla.
- Estado de salvamento deve estar sempre claro.
- Botão de ação final deve ter maior ênfase do que `Salvar rascunho`.

---

# 33. Padrões que devem ser evitados

Não utilizar:

- excesso de menta em toda a interface;
- lilás como cor primária do produto;
- sombras pesadas em todos os cards;
- bordas exageradamente arredondadas em elementos operacionais;
- animações longas;
- placeholders substituindo labels;
- informação clínica codificada apenas por cor;
- gradientes fortes em tabelas ou prontuários;
- componentes fora da escala de spacing sem motivo;
- cores hardcoded em componentes quando existe token semântico apropriado.

---

# 34. Checklist para uma IA validar uma tela

Antes de considerar uma tela VidaPlena consistente, verificar:

- [ ] O background usa o token correto para o tema?
- [ ] Os componentes usam tokens semânticos?
- [ ] Poppins está restrito a títulos/branding?
- [ ] Inter é usado em dados e conteúdo operacional?
- [ ] O spacing segue múltiplos da escala de 4px?
- [ ] Cards usam radius moderado e borda discreta?
- [ ] Inputs têm labels explícitos?
- [ ] Campos médicos exibem unidade?
- [ ] Estados combinam texto e cor?
- [ ] Informação clínica importante não depende apenas de cor?
- [ ] Focus ring é visível?
- [ ] Ações destrutivas usam destructive?
- [ ] O menta não está sendo confundido com success?
- [ ] Motion é sutil?
- [ ] A tela continua utilizável no dark mode?
- [ ] A responsividade reorganiza o conteúdo em vez de apenas comprimir?
- [ ] Em prontuário, o paciente está claramente identificado?
- [ ] O estado de salvamento está explícito quando aplicável?
- [ ] A interface clínica privilegia legibilidade sobre ornamentação?

---

# 35. Prompt-base sugerido para outra IA

```text
Você está trabalhando no produto VidaPlena.

Use o VidaPlena Design System como fonte de verdade visual.

Princípios principais:
- interface clínica, humana e operacional;
- 70% neutros, 15% azul, 10% menta e 5% lilás como equilíbrio geral;
- azul representa confiança e ação;
- menta representa cuidado e conexão, mas não equivale automaticamente a sucesso;
- creme/warm neutral é o canvas principal no light mode;
- lilás é terciário e deve ser reservado principalmente para teleconsulta e tecnologia;
- Poppins para branding e headings;
- Inter para UI, tabelas, agenda, prontuário e formulários;
- spacing baseado em grid de 4px;
- radius moderado;
- sombras discretas;
- motion sutil;
- componentes baseados em tokens semânticos compatíveis com Shadcn/ui;
- evitar motion ornamental em tarefas clínicas críticas;
- nunca depender apenas de cor para comunicar informação clínica;
- labels de input devem permanecer visíveis;
- unidades médicas devem permanecer visíveis;
- estados de salvamento devem ser explícitos.

Ao gerar código, prefira componentes Shadcn/ui e Lucide Icons.
Use ScrollX UI principalmente para onboarding, empty states, waiting room, dashboards, marketing e transições não críticas.

Respeite os tokens e padrões definidos neste documento. Não invente novas cores, tipografias, escalas ou padrões se já existir um equivalente no design system.
```

---

# 36. Referência rápida

```yaml
brand:
  name: VidaPlena
  version: 1.0
  personality:
    - clinical
    - human
    - operational
    - trustworthy
    - calm

fonts:
  heading: Poppins
  body: Inter

color_balance:
  neutral: 70%
  blue: 15%
  mint: 10%
  lilac: 5%

layout:
  spacing_base: 4px
  sidebar_desktop: 280px
  sidebar_medium: 220px

breakpoints:
  medium: 1050px
  mobile: 760px

radii:
  sm: 6px
  md: 10px
  base: 12px
  xl: 16px
  2xl: 24px
  pill: 999px

component_height:
  button: 44px
  input: 44px

motion:
  micro: 120ms
  interaction: 150ms
  dropdown: 180ms
  sheet: 220ms
  modal: 250ms
  page: 250-300ms

icons:
  library: Lucide
  sizes: [16, 20, 24, 32]
  stroke: "1.75-2px"

frameworks:
  - Shadcn/ui
  - ScrollX UI
  - Tailwind CSS
```

---

# 37. Resumo final da identidade

O VidaPlena deve parecer:

**clínico sem ser frio, tecnológico sem ser futurista, humano sem ser infantil e operacional sem ser visualmente pesado.**

A identidade se sustenta por:

- azul profundo como eixo de confiança e ação;
- menta como assinatura de cuidado e conexão;
- warm neutrals como base acolhedora;
- lilás como apoio tecnológico;
- Poppins para personalidade;
- Inter para produtividade e leitura;
- componentes simples e semânticos;
- densidade controlada;
- motion discreto;
- prioridade máxima para clareza clínica.
