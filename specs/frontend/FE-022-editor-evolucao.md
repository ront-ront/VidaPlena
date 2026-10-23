# FE-022 - Editor de evolução, rascunho e adendo

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, BE-034, BE-035, BE-036
- **Requisitos cobertos:** RF-017, RN-008, RNF-008, UI-010

## 1. Objetivo
Permitir ao profissional registrar e recuperar rascunho clínico, finalizar de forma consciente e corrigir depois somente por adendo.

## 2. Escopo
- Inclui: painel de evolução, campos clínicos/CID-10, autosave, estado persistido, finalizar e formulário de adendo.
- NÃO inclui: edição de finalizada, catálogo documental/prescrição ou publicação automática ao paciente.

## 3. Contexto necessário
Ler Design System §§18.4/19/32, `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m2` (evolution), `specs/shared/business-rules.md` RN-008, DRS §3.3.2/§4.2.4 e Q-04.

## 4. Detalhamento
- **Layout de origem:** painel amplo no prontuário com título, badge `Rascunho/Salvando…/Salvo/Erro ao salvar`, textarea mínimo 160 px, ação secundária Salvar rascunho e primária Finalizar. Campos rotulados para queixa, história, exame, hipótese diagnóstica, conduta e busca CID-10 código+descrição. Evitar animação ornamental.
- Autosave envia draft em até 30 s de digitação via FE-004, com `expectedDraftVersion`; erro/409 preserva texto local e mostra ação de recuperar/comparar, nunca indica Salvo. Expiração de sessão não descarta última versão persistida; conteúdo não sincronizado é avisado antes de sair.
- Finalizar exige confirmação, revalida versão e mostra autor/data/hash sem permitir edição. Original e adendos aparecem juntos; botão Corrigir abre motivo obrigatório e novo texto, só autor. Texto/ícone distinguem estados além de cor.

## 5. Critérios de aceite
- [ ] Dado texto digitado, quando transcorrer 30 s com conexão, então draft fica persistido e badge muda de Salvando para Salvo somente após resposta.
- [ ] Dada falha de rede/sessão, quando retornar, então última versão persistida reaparece e texto ainda não salvo não é descartado silenciosamente.
- [ ] Dada finalização, quando tentar editar original, então UI não oferece edição e API rejeita; adendo exige justificativa e aparece ligado ao original.
- [ ] Dado conflito de `draftVersion`, quando salvar, então mostra conflito/recuperação sem sobrescrever trabalho de outro contexto.

## 6. Testes esperados
Autosave com relógio, rede offline/erro, conflito, recuperação, CID inválido, finalização/adendo/autoria, teclado e tablet; lint.

## 7. Definition of Done
- [ ] Estados de persistência fiéis §§18/32 e RNF-008 verificado com relógio.
- [ ] Testes/lint passam; nenhuma edição de finalizada, sem `tsc`.

## 8. Suposições e pontos em aberto
Política de rascunho abandonado e campos entre especialidades dependem revisão clínica; não presumir publicação do texto integral ao paciente.
