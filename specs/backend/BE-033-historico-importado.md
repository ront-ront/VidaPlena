# BE-033 - Lançamento manual de histórico importado

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** implementada e verificada localmente; fontes reais/corte e validação pré-produção pendentes P-07
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
- Q-19 atribui lançamento a admin/gestor, mas RN-007 impede que esses papéis leiam conteúdo clínico. **P-11 aprovada:** entrada cega de arquivo/metadados; não cria permissão clínica administrativa. Concretização P-59 em contrato compartilhado.
- Registro guarda paciente, data original conhecida, origem, autor anterior se conhecido, importador, data e arquivo/referência. É marcado “histórico importado”, nunca `ClinicalEvolution.finalized`. Profissional com vínculo pode marcar “conferido por”; correção cria adendo justificado sem sobrescrever.
- Entrada não cria conta, consentimento ou notificação; acesso digital do paciente continua sujeito ao termo. Auditoria registra lote/registro, quem importou e conferiu, sem conteúdo clínico em metadados.

## 5. Critérios de aceite
- [x] Dada entrada cega aprovada em P-11, quando admin/gestor enviarem arquivo e metadados, então recebem somente recibo e não conseguem ler/baixar o conteúdo clínico armazenado.
- [x] Dado registro aceito por fluxo aprovado, quando consultar timeline, então origem/data/importador e ausência de assinatura aparecem claramente.
- [x] Dada tentativa de UPDATE/DELETE, quando executar, então falha; adendo justificado mantém original visível.
- [x] Dado profissional sem vínculo, quando conferir/ler, então acesso negado e auditado.

## 6. Testes esperados
Permissão após decisão P-11, imutabilidade, conferência, adendo, origem, ausência de conta/aviso e IDOR; lint.

## 7. Definition of Done
- [x] P-11 resolvido e registrado em `04-open-questions.md` antes de habilitar entrada clínica.
- [x] Testes/lint passam; importado não vira evolução assinada, sem `tsc`.

## 8. Suposições e pontos em aberto
P-11 aprovada pelo usuário: entrada cega por admin/gestor. Fontes reais/data de corte e validação clínica pendem P-07.

## Evidência local —25/11/2026

Models/migration ImportedHistory/Check/Addendum, vínculo imutável do arquivo, metadados/adendos e conteúdo cifrados, multipart com validação real de conteúdo/tamanho/extensão, recibo cego, detalhe/conferência/adendo profissionais e origem na timeline. Conferência única idempotente, original intocado e adendos juntos. Urgência abre somente leitura/download; pré-consulta não abre histórico. Sem criação de conta, consentimento, evolução assinada ou notificação.

FileAccessPolicy passa base clínica ao audit de link/download e preserva fallback de consentimento. Provisórios sem ImportedHistory não podem ser baixados; falhas limpam upload e reconciliador BE-013 remove órfãos antigos. Arquivos vinculados são protegidos contra mutação no PostgreSQL.

9/9 testes específicos e43/43 regressão HTTP/PostgreSQL (BE-030–033 + arquivos/consentimento M0),28/28 Node, lint247 e Prisma validate/generate aprovados. Revisão1/1 testa ainda URL efetivamente expirada pela rota HTTP. Logs `/tmp/vidaplena-be033-{integration,regression,expiry,node,final-lint}.log`; bases descartáveis criadas/removidas para testes, sem banco dev ou tsc. Produção clínica e fontes reais/corte permanecem P-07; não confundir evidência local com parecer jurídico.
