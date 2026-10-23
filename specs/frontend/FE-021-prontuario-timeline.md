# FE-021 - Agenda clínica, cabeçalho e timeline do prontuário

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-003, BE-030, BE-032, BE-037
- **Requisitos cobertos:** RF-016, RF-022, UI-010, UI-012, RNF-004

## 1. Objetivo
Abrir prontuário a partir da fila/agenda do profissional com identificação e alertas sempre visíveis, timeline filtrável e base de acesso explícita.

## 2. Escopo
- Inclui: `/clinico/agenda`, `/prontuarios/[patientId]`, header, alertas resumidos, timeline e estados de acesso.
- NÃO inclui: editor de evolução (FE-022), edição de alerta (FE-023), projeção do paciente (FE-027).

## 3. Contexto necessário
Ler `apps/frontend/docs/VidaPlena_Design_System.md` §§18/32, `specs/frontend/design-system.md` (Prontuário), `specs/frontend/screens-map.md`, `specs/shared/api-contracts.md#m2` (records/timeline), `specs/shared/access-policy.md` e DRS §§3.3.1/3.3.7.

## 4. Detalhamento
- **Layout de origem:** entrada pela agenda/fila própria; header com avatar/iniciais 44 px, nome, idade, número do prontuário, última consulta e alertas críticos em destaque permanente. Timeline com linha vertical azul clara, marcadores, data secundária, título e resumo por evento; filtros período/especialidade/tipo e paginação por blocos. Ornamentação reduzida e legibilidade clínica prioritária.
- Mostrar origem “histórico importado” e base de acesso/expiração sem revelar campos entre especialidades ainda pendentes P-06. Primeira consulta tem vazio explícito; loading skeleton, erro com retry e sem vínculo com caminho FE-028, jamais renderizando dado anterior após 403/404.
- Patient header permanece reconhecível em tablet; alertas usam texto/ícone, não só cor. Consulta chama FE-004 e gera auditoria no backend; a UI não implementa guard clínico local como única proteção.

## 5. Critérios de aceite
- [ ] Dado profissional vinculado, quando abrir pela fila, então header, alertas e timeline autorizada aparecem e a API audita a leitura.
- [ ] Dado prontuário sem encontros, quando abrir, então estado de primeira consulta aparece sem evento inventado.
- [ ] Dado vínculo ausente/expirado, quando abrir URL direta, então nenhum conteúdo anterior permanece na tela e acesso de urgência é oferecido quando cabível.
- [ ] Dado timeline extensa, quando rolar/filtrar, então carrega bloco seguinte sem despejar todo histórico; marcador de importado é visível.
- [ ] Dada sessão de uma hora de treinamento, quando avaliar profissionais, então 90% localizam atendimento anterior e iniciam evolução sem auxílio; medir com FE-022.

## 6. Testes esperados
Layout visual §§18/32, vínculo/negação, vazio, paginação/filtros, alerta textual, tablet/teclado e ensaio RNF-004 com FE-022; lint.

## 7. Definition of Done
- [ ] Tela fiel ao layout de origem e aos campos autorizados; nenhuma leitura clínica por papel administrativo.
- [ ] Testes/lint passam; ensaio com usuários registrado quando ocorrer, sem `tsc`.

## 8. Suposições e pontos em aberto
Campos entre especialidades dependem P-06. Agenda clínica é proposta Q-14 ligada ao fluxo de entrada do DRS, enquanto header/timeline têm origem explícita no Design System.
