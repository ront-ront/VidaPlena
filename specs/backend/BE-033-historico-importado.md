# BE-033 - Lançamento manual de histórico importado

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-032, BE-005
- **Requisitos cobertos:** RF-016, RF-022, RN-012, RNF-005

## 1. Objetivo
Registrar histórico anterior identificado por origem/data/importador, imutável e distinto de evolução assinada, com conferência por profissional.

## 2. Escopo
- Inclui: `ImportedHistory`/adendo, entrada manual controlada, conferência por profissional vinculado e exibição na timeline.
- NÃO inclui: OCR/migração em massa, criação de conta, assinatura retroativa ou acesso clínico administrativo presumido.

## 3. Contexto necessário
Ler `specs/shared/import-templates.md` (Histórico manual), `specs/shared/data-model.md#m2`, `specs/shared/api-contracts.md#m2` (Histórico importado), `specs/shared/access-policy.md`, Q-19 e P-11.

## 4. Detalhamento
- Q-19 atribui lançamento a admin/gestor, mas RN-007 impede que esses papéis leiam conteúdo clínico. **P-11 deve resolver** entrada cega de arquivo/metadados ou concessão excepcional limitada antes de expor o endpoint; não criar permissão clínica por inferência.
- Registro guarda paciente, data original conhecida, origem, autor anterior se conhecido, importador, data e arquivo/referência. É marcado “histórico importado”, nunca `ClinicalEvolution.finalized`. Profissional com vínculo pode marcar “conferido por”; correção cria adendo justificado sem sobrescrever.
- Entrada não cria conta, consentimento ou notificação; acesso digital do paciente continua sujeito ao termo. Auditoria registra lote/registro, quem importou e conferiu, sem conteúdo clínico em metadados.

## 5. Critérios de aceite
- [ ] Dado P-11 ainda sem decisão, quando implementar, então endpoint de conteúdo não é habilitado e a spec permanece bloqueada.
- [ ] Dado registro aceito por fluxo aprovado, quando consultar timeline, então origem/data/importador e ausência de assinatura aparecem claramente.
- [ ] Dada tentativa de UPDATE/DELETE, quando executar, então falha; adendo justificado mantém original visível.
- [ ] Dado profissional sem vínculo, quando conferir/ler, então acesso negado e auditado.

## 6. Testes esperados
Permissão após decisão P-11, imutabilidade, conferência, adendo, origem, ausência de conta/aviso e IDOR; lint.

## 7. Definition of Done
- [ ] P-11 resolvido e registrado em `04-open-questions.md` antes de habilitar entrada clínica.
- [ ] Testes/lint passam; importado não vira evolução assinada, sem `tsc`.

## 8. Suposições e pontos em aberto
Quem insere conteúdo clínico e como permanece P-11; nenhuma solução é afirmada como aprovada. Fontes reais/data de corte também pendem P-07.
