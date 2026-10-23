# BE-036 - Finalização imutável e adendos justificados

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-035, BE-004
- **Requisitos cobertos:** RF-017, RN-008, RN-012, RNF-005

## 1. Objetivo
Congelar evolução concluída com autoria, data e hash; toda correção posterior é adendo do autor ligado ao original.

## 2. Escopo
- Inclui: finalização, constraint/guard de imutabilidade, `EvolutionAddendum`, leitura conjunta e retenção.
- NÃO inclui: edição direta por 24 h, exclusão física ou assinatura de documento clínico (BE-038).

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2`, `specs/shared/api-contracts.md#m2` (finalize/addenda), `specs/shared/business-rules.md` RN-008/012, DRS §3.3.2/§4.2.1 e Q-04.

## 4. Detalhamento
- Autor finaliza draft com `expectedDraftVersion`; validar conteúdo mínimo do contrato clínico antes de congelar e registrar UTC, ID do autor, hash e auditoria na mesma unidade de trabalho. Operações UPDATE/DELETE de finalizada são bloqueadas por aplicação e permissão/constraint de persistência.
- Adendo exige mesmo autor original, justificativa e texto; append-only, preserva original integral e exibe ambos em ordem. Novo adendo não reabre original. Retenção por `privacy.clinical_retention_years` nunca abaixo RN-012.
- A redação de RN-008 com janela de 24 h foi substituída por Q-04: **nenhum prazo permite editar original**. Arquivo de evolução assinada/finalizada é imutável também em FileStorage.

## 5. Critérios de aceite
- [ ] Dada evolução finalizada, quando qualquer papel tentar PATCH/DELETE direto ou via repository, então conteúdo/hash originais permanecem.
- [ ] Dado autor com justificativa, quando criar adendo, então original e adendo aparecem juntos com autores/datas e auditoria.
- [ ] Dado outro profissional ou justificativa vazia, quando tentar adendo, então 403/400 e nada é gravado.
- [ ] Dado prazo de retenção ainda vigente, quando executar limpeza/restauração, então evolução não é apagada fisicamente.

## 6. Testes esperados
Finalização concorrente, hash, UPDATE/DELETE deliberado, adendo/autoria/justificativa, leitura conjunta, retenção e auditoria; lint.

## 7. Definition of Done
- [ ] Imutabilidade provada no banco e API; original sempre consultável.
- [ ] Testes/lint passam; desvio Q-04 visível na matriz, sem `tsc`.

## 8. Suposições e pontos em aberto
Assinatura legal da evolução, se exigida por responsável técnico, não foi detalhada; esta spec garante finalização/imutabilidade, e P-02 governa documentos emitidos.
