# Design system operacional VidaPlena

**Fontes de verdade:** `apps/frontend/AGENTS.md` inteiro e `apps/frontend/docs/VidaPlena_Design_System.md` §§1–37. Este arquivo extrai decisões para FE; valores completos de primitivas permanecem no documento original. Em 23/10/2026, `apps/frontend/src/app/globals.css` (359 linhas lidas) **já define** tokens principais, primitivas, status, especialidades e temas. FE-001 compara a implementação com esta especificação e adiciona apenas lacunas; Q-13 não autoriza sobrescrever estilo existente sem necessidade.

## Princípio visual e cores

Interface clínica, humana e operacional: neutros quentes predominam, azul profundo para ação/confiança, menta como assinatura de cuidado, lilás auxiliar para teleconsulta. Proporção sugerida 70% neutros, 15% azul, 10% menta, 5% lilás, não métrica rígida por tela. Marca e status são diferentes; menta de marca não significa sucesso. Gradientes só em marca/hero/destaques institucionais, não em leitura clínica densa.

| Família | Tons 50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 900 / 950 |
| --- | --- |
| Vida Blue | `#EFF7FB` / `#DCECF5` / `#BBD9E9` / `#91C0D8` / `#6AA7C8` / `#5091BC` / `#397EAA` / `#256996` / `#0C4E80` / `#0A416B` / `#062B47` |
| Vida Mint | `#ECFBF7` / `#D4F6EC` / `#A9ECD9` / `#7CDEC4` / `#50D6B2` / `#4AC3A2` / `#2FAE8D` / `#218A70` / `#196C59` / `#155748` / `#0B332A` |
| Vida Lilac | `#FAF8FD` / `#F2EDF8` / `#E5DFED` / `#D4C9E5` / `#BEAFD9` / `#A493CB` / `#8874B5` / `#6F5B99` / `#584978` / `#473C61` / `#2D263F` |
| Warm Neutral | `#F8F5EE` / `#F3EFE5` / `#E7E1D6` / `#D3CDC2` / `#AEA89F` / `#858078` / `#625F5A` / `#464541` / `#2F302E` / `#1E201F` / `#121413`; extras `neutral-0=#FFFFFF`, `neutral-25=#FCFBF7` |

`brand-mint-highlight=#38D5A8`. Gradiente principal: 135° `#0C4E80` → `#5091BC` a 52% → `#4AC3A2`. Especialidades usam oito pares de foreground/background listados no documento original §6 e no CSS atual; cor sempre acompanhada de texto. Ícones Lucide lineares 16/20/24/32 px, stroke ~1,75–2.

### Tokens semânticos

Componentes comuns usam `background/foreground/card/primary/secondary/muted/accent/destructive/border/input/ring`, nunca shade bruto para papel semântico. `brand-*` só para marca/categoria.

| Token | Claro | Escuro |
| --- | --- | --- |
| background / foreground | `#F8F5EE` / `#1E201F` | `#0E1A21` / `#F7FAFC` |
| card / card-foreground | `#FFFFFF` / `#1E201F` | `#152630` / `#F7FAFC` |
| popover / popover-foreground | `#FFFFFF` / `#1E201F` | `#1B303C` / `#F7FAFC` |
| primary / primary-foreground | `#0C4E80` / `#FFFFFF` | `#6AA7C8` / `#07131A` |
| secondary / secondary-foreground | `#EFF7FB` / `#0C4E80` | `#1B303C` / `#DCECF5` |
| muted / muted-foreground | `#F3EFE5` / `#625F5A` | `#1B303C` / `#C0CAD0` |
| accent / accent-foreground | `#ECFBF7` / `#155748` | `#15372F` / `#A9ECD9` |
| destructive / destructive-foreground | `#C4313C` / `#FFFFFF` | `#E76670` / `#1A0B0D` |
| border / input / ring | `#D3CDC2` / `#D3CDC2` / `#397EAA` | `#334B59` / `#334B59` / `#91C0D8` |

Status informação/sucesso/aviso/erro/neutro: respectivamente FG/BG `#1F668F/#EDF7FC`, `#0F5F43/#EAF8F1`, `#7A4300/#FFF4DB`, `#9E2630/#FDECEF`, `#475A67/#EFF3F5`. Usar texto + cor e ícone quando risco clínico. Tema claro/escuro troca classe `dark` em `<html>` e persiste `vp-theme` (`light`/`dark`) no `localStorage`, conforme §27; aplicação inicial evita flash de tema incorreto. Dark mode mantém hierarquia, não inverte cores mecanicamente.

## Tipografia, geometria e motion

Poppins em branding/títulos, Inter em corpo, formulários, dados, agenda e prontuário. Escala: display 48/56 peso 700, h1 36/44 700, h2 30/38 700, h3 24/32 600, título 20/28 Inter 600, corpo 16/24 ou 14/20 Inter 400, label 12/16 Inter 600. Pesos de origem Poppins 500/600/700 e Inter 400/500/600/700; verificar carregamento atual.

Spacing base 4 px: 4, 8, 12, 16, 24, 32, 48. Radius `sm=6`, `md=10`, semântico `12`, `xl=16`, `2xl=24`, pill `999` px. Botão ≈11 px, input 10 px, card 16 px. Sombras discretas: `shadow-1=0 1px 2px rgb(18 20 19/.06)`, `shadow-2=0 4px 12px rgb(18 20 19/.10)`, `shadow-3=0 12px 32px rgb(18 20 19/.14)`.

Motion: micro 120 ms, interação 150, dropdown 180, sheet 220, modal 250, página 250–300. Evitar animação ornamental em prontuário/decisões clínicas; ScrollX UI pode apoiar onboarding, espera, vazio, dashboard e transição não crítica. Respeitar preferência por movimento reduzido como proposta técnica de acessibilidade derivada de UI-006/RNF-003.

## Componentes e estados

- **Button:** ações primárias em `primary`, secundárias em `secondary`, ghost discreto, destrutivas em `destructive`; altura de produto 44–48 px, foco visível e disabled explícito. O `Button` existente tem default `h-9`; FE-002 deve usar/adaptar tamanho de produto sem alterar variantes fora do escopo.
- **Input:** altura 44 px, borda `input`, radius 10 px, padding horizontal 12 px, ring perceptível. Label persistente acima; placeholder nunca substitui label. Help text abaixo, 11 px `muted-foreground`; erro ligado ao campo por texto/ARIA.
- **Campo médico:** unidade sempre visível; contexto/última medição quando útil; formatação pt-BR. **Textarea:** largura total, altura mínima 160 px, padding 12 px, resize vertical.
- **Badge/status:** pill, padding 6×9 px, 11 px/700, ponto colorido e texto; estados incluem informado, confirmado, aguardando, em atendimento, finalizado, cancelado, no-show e salvo.
- **Card:** `card`, borda, radius 16 px, shadow-1, padding 20 px; card de componente 22 px. Card agrupa conteúdo semanticamente e não encobre informação crítica em hover.
- **Estados obrigatórios quando aplicáveis:** loading, vazio, erro acionável, disabled, hover, focus, sucesso; em evolução, `Rascunho`, `Salvando…`, `Salvo`, `Erro ao salvar` devem ser inequívocos.
- **Primitives:** Shadcn/ui/Base UI sob controle do projeto; Button, Input, Dialog, Sheet, Tabs, Data Table, Calendar e Command são referências. Tokens semânticos prevalecem sobre cores hardcoded.

## Layout e responsividade

Shell desktop do design system: sidebar sticky de 280 px, altura 100 vh, padding 24×18 px, borda, scroll; item de navegação flex com gap 10 px, padding 9×10 px, radius 9 px, texto 13 px/500; ativo em `secondary` e peso 700. Em até 1050 px, sidebar 220 px; em até 760 px, sidebar principal some e navegação acessível precisa alternativa proposta em FE-003. Grids se reorganizam, não comprimem conteúdo. Agenda operacional pode rolar horizontalmente em viewport estreita com grade mínima de 620 px; telas do **paciente** devem funcionar desde 360 px sem rolagem horizontal do viewport (RNF-019).

**Agenda operacional (§§17/31):** topbar título/data/busca; cards de total/confirmadas/no-show; grade com hora fixa e especialidades/profissionais, slots por status com texto; densidade para scanning rápido. Ações de agendar/reagendar/cancelar/check-in devem partir da agenda em até dois cliques (RNF-002). **Prontuário (§§18/32):** cabeçalho claro com avatar 44 px, nome, idade, número, última consulta e alertas; timeline escaneável; painel de evolução amplo com salvamento explícito, ação final de maior ênfase.

## Acessibilidade e conferência

Paciente: WCAG 2.1 AA, contraste mínimo 4,5:1 onde RNF-003 exige, teclado completo, labels associados e leitor de tela. Informação clínica nunca só por cor. Tema escuro mantém contraste. Interface em pt-BR; `apps/frontend/src/app/layout.tsx` está com `lang="en"` e FE-001 deve corrigir ao implementar. As telas usam mensagens de erro que indicam causa e próximo passo, sem código técnico. Antipadrões do Design System §33 (excesso de menta, lilás primário, gradiente em tabela, placeholder como label, sombras pesadas) são proibidos.
