# BE-043 - Projeção autorizada do histórico do paciente

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-032, BE-039, BE-041, BE-042, BE-012
- **Requisitos cobertos:** RF-022, RN-007, RNF-016

## 1. Objetivo
Servir ao paciente/responsável apenas o histórico explicitamente liberado, mantendo direitos formais RF-005 separados da navegação comum.

## 2. Escopo
- Inclui: `PatientPublication`, publicação/revogação auditada, timeline filtrada, documentos/resultados/orientações e download autorizado.
- NÃO inclui: evolução integral, rascunho, hipótese, nota interna, urgência/auditoria de terceiros ou exportação formal automática.

## 3. Contexto necessário
Ler `specs/shared/access-policy.md` (Projeção do portal), `specs/shared/api-contracts.md#m2` (publications/me), `specs/shared/data-model.md#m2`, DRS §3.3.7/§4.4.5 e Q-03/Q-05/Q-09.

## 4. Detalhamento
- Profissional autorizado publica recurso elegível explicitamente; `PatientPublication` guarda autor/data/visibilidade. Dados cadastrais e agenda aparecem conforme serviços próprios; história clínica mostra apenas documentos disponibilizados, prescrições/resultados, orientações publicadas e resumo com diagnóstico confirmado **marcado como publicável**. Rascunho, anamnese/exame/hipótese e evolução integral não entram.
- `GET /v1/me/clinical-history` aplica conta própria/GuardianLink ativo, consentimento vigente, cursor/filtros e nível de publicação atual no servidor. Revogação bloqueia portal; pedido formal de acesso/exportação continua BE-012 por canal autorizado, sujeito P-01.
- Documento `issued_dev` aparece com selo “sem validade jurídica”, status de anulação e sem aparência de receita/atestado juridicamente válido. Cada leitura/download gera auditoria, arquivo segue BE-013.

## 5. Critérios de aceite
- [ ] Dado recurso clínico não publicado, quando paciente consultar, então ele não aparece; ID direto retorna 404.
- [ ] Dado resumo com hipótese não confirmada, quando tentar publicar, então 400 e nenhum diagnóstico é divulgado.
- [ ] Dado dependente sem vínculo ou consentimento revogado, quando abrir histórico, então acesso negado, inclusive por URL manipulada.
- [ ] Dado documento dev/anulado, quando publicado, então estado jurídico/anulação aparecem e cada download é auditado.

## 6. Testes esperados
Projeção positiva/negativa por tipo, rascunho/hipótese, IDOR/dependente, revogação, status dev/anulação, paginação e auditoria; lint.

## 7. Definition of Done
- [ ] Resposta é allowlist de campos, não serialização do prontuário interno.
- [ ] Testes/lint passam; direito de acesso formal preservado, sem `tsc`.

## 8. Suposições e pontos em aberto
Exceções de sigilo/maioridade de dependentes e forma de atender pedido após revogação aguardam jurídico P-01. A decisão de projeção comum é técnica delegada Q-03.
