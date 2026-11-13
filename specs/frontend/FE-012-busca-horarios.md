# FE-012 - Busca de especialidade e horários do paciente

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente, com confirmação FE-013 e espera FE-017 integradas; ensaio com usuários pendente
- **Depende de:** FE-003, FE-004, BE-019
- **Requisitos cobertos:** RF-006, RNF-001, RNF-019

## 1. Objetivo
Permitir ao paciente/responsável encontrar horário elegível com filtros claros e caminho curto até a confirmação.

## 2. Escopo
- Inclui: `/agendar` com especialidade, profissional opcional, modalidade, tipo e período; lista por dia/profissional e próximo horário.
- NÃO inclui: reserva/confirmar (FE-013), espera (FE-017) ou sala escolhida pelo paciente.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (M1), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m1` (catalog/availability), DRS §3.2.1, RN-003, RNF-001 e Design System §17.1.

## 4. Detalhamento
- Layout proposto Q-14, mais espaçoso que agenda da recepção: cabeçalho com progresso da tarefa, filtros em sequência, agrupamento de dias e cards/linhas de slots com hora, profissional e modalidade; profissional opcional mostra todos da especialidade. Usar serviço FE-004; não exibir ocupante de horário bloqueado.
- Estado vazio informa indisponibilidade, `nearestAvailableAt` e acesso à espera quando FE-017 estiver disponível. Loading, erro recuperável, seleção expirada e filtro sem modalidade remota têm orientação. Escolha de slot leva FE-013 sem reservar antes.
- Paciente usa a tela a partir de 360 px, sem scroll horizontal; labels/contraste/teclado/leitor de tela WCAG 2.1 AA. Medir fluxo FE-012+013 para RNF-001.

## 5. Critérios de aceite
- [x] Dada especialidade sem horário, quando buscar, então mostra estado vazio e próxima data válida se existir; opção de espera é integrada quando FE-017 estiver disponível (detalhamento/P-38).
- [x] Dado profissional não selecionado, quando buscar, então lista horários de todos os profissionais elegíveis da especialidade.
- [x] Dado horário bloqueado ou remoto não habilitado, quando atualizar, então não aparece como selecionável.
- [x] Dado viewport de 360 px/teclado, quando filtrar e escolher, então nenhuma função se perde nem o viewport rola horizontalmente.

## 6. Testes esperados
Filtros/ordem, vazio/próxima data, modalidade, loading/erro, 360 px, teclado/leitor de tela; ensaio RNF-001 com FE-013.

## 7. Definition of Done
- [x] Somente serviços contratados, sem reserva otimista; tokens/componentes únicos.
- [x] Testes pertinentes e lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
RNF-001 exige teste real de usabilidade com participantes; teste automatizado de clique não comprova sozinho 90% em três minutos.

## Evidência local — 13/11/2026

`/agendar` contém filtros sequenciais, catálogos paginados completos, horário por dia/profissional, modalidade elegível e período civil explícito. API define slots/RN-003 e fuso; UI não calcula disponibilidade nem cria reserva. Seleção é administrativa, mostra resumo sem sucesso de agendamento e é invalidada quando sai da fotografia atualizada. P-38 define a passagem à revisão FE-013 na mesma rota; RF-012 visual só entra em FE-017, conforme detalhamento original.

**6/6 testes Firefox com API simulada**, com regressão de catálogo/grade **20/20 browser**, lint monorepo (backend213/front64) e build Next aprovados. Cobertos catálogos por cursor, todos os profissionais, próxima data, remoto, sala indisponível, expiração de seleção, retry, perfis, teclado e 360 px sem overflow. Captura mobile inspecionada. Logs `/tmp/vidaplena-fe012-{e2e,lint,build}.log`. WCAG com leitor de tela e RNF-001 com participantes continuam pendentes; não afirmar esse ensaio por contagem automática. Nenhum `tsc` ou commit.

**Integração FE-017 — 13/11/2026:** busca vazia oferece link acessível para `/agenda/espera`; inscrição/ofertas ficam nessa tela, sem reservar horário na busca. Teste específico de navegação/360 px e regressão completa 70/70 Firefox aprovados, com lint/build. Confirmação FE-013 também já integrada. Leitor de tela manual e ensaio RNF-001 permanecem pendentes.
