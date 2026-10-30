# BE-011 - Versões, aceite presencial e revogação de consentimento

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada localmente; validação jurídica P-01 pendente para produção
- **Depende de:** BE-004, BE-010, BE-013
- **Requisitos cobertos:** RF-004, RNF-016

## 1. Objetivo
Registrar manifestação de dados pessoais/sensíveis por paciente ou responsável, com versão, ator e origem, e aplicar a revogação imediatamente.

## 2. Escopo
- Inclui: publicação imutável de versão, aceite/recusa/revogação append-only, cadastro+aceite atômicos e evidência presencial referenciada.
- NÃO inclui: consentimentos de teleconsulta/gravação (M3), parecer jurídico definitivo nem eliminação física de prontuário.

## 3. Contexto necessário
Ler `specs/shared/data-model.md` (`Consent*`), `specs/shared/api-contracts.md` (cadastro/consentimento), `specs/shared/business-rules.md` (revogação), `specs/shared/access-policy.md`, DRS §3.1.4 e Q-05/Q-09.

## 4. Detalhamento
- Guardar `ConsentDocumentVersion` com texto/referência e vigência; `ConsentEvent` com paciente, ator registrador, nome e parentesco do responsável consentinte como snapshot, data/hora, ação, versão, origem e evidência assinada quando presencial. Versão antiga e eventos nunca são sobrescritos. Publicação por admin é suposição técnica pendente de confirmação DPO.
- `POST /v1/patient-registrations`/`patients` conclui paciente e aceite na mesma transação de banco; recusa do termo bloqueia conclusão digital e orienta atendimento presencial. `POST /v1/patients/{id}/onsite-consents` registra aceite presencial posterior em paciente já cadastrado. Em ambos os fluxos presenciais, arquivo `signedTerm` é obrigatório no multipart: BE-013 valida/cifra, o `signedFileId` resultante liga-se ao evento; falha de banco descarta o upload, e reconciliação limpa órfãos após interrupção abrupta. Não concluir sem anexo verificável.
- Revogar registra evento, invalida acesso digital e bloqueia notificações/tratamentos só consentidos; preserva prontuário/identificação mínima/auditoria/consentimentos/dados fiscais conforme Q-09, com acesso restrito. Os prazos vêm de `privacy.clinical_retention_years`, `privacy.audit_retention_years`, `privacy.min_identity_retention_years`, `privacy.consent_evidence_retention_years` e `privacy.fiscal_retention_years`; as três últimas chaves aguardam P-01. Nova versão requer novo aceite no acesso seguinte.

## 5. Critérios de aceite
- [x] Dado aceite de versão vigente, quando cadastrar, então paciente e ConsentEvent persistem juntos; falha de um desfaz ambos.
- [x] Dada recusa em autocadastro, quando tentar concluir, então não há conta/perfil digital criado; se o paciente já possui perfil administrativo, a recusa pode ser registrada nele como ConsentEvent sem ativar portal.
- [x] Dada versão nova, quando paciente entrar, então operações digitais dependentes aguardam novo aceite e histórico antigo permanece.
- [x] Dada revogação, quando próxima requisição de portal/notificação ocorrer, então é bloqueada; retenção obrigatória não é apagada.
- [x] Dado responsável presencial, quando registrar, então evento mostra responsável, parentesco, data, versão, origem e arquivo assinado autorizado.
- [x] Dado paciente já cadastrado e termo novo, quando recepção registrar aceite presencial com termo assinado, então surge novo evento sem sobrescrever a versão anterior.

## 6. Testes esperados
Integração de transação cadastro+aceite, versão, recusa, revogação imediata, responsável/evidência e auditoria; teste de acesso negado após revogação. Lint.

## 7. Definition of Done
- [x] Histórico imutável e projeção de estado atual derivada de eventos.
- [x] Infraestrutura BE-013 necessária ao termo presencial integrada; validação jurídica P-01 permanece explícita; testes/lint passam.
- [x] Contrato compartilhado respeitado, sem `tsc`.

## 8. Suposições e pontos em aberto
Base legal e retenção pós-revogação são proposta provisória sujeita a DPO/jurídico (P-01). Publicador do termo e regras de responsável maior de idade exigem decisão; não afirmar conformidade LGPD final.

### Evidência local em 30/10/2026

Migrations `202610290009_consent` a `202610300013_consent_evidence_trigger_update` aplicadas no banco de teste; versões e eventos protegidos contra UPDATE/DELETE/TRUNCATE, evidência vinculada imutável, estado derivado pela sequência de eventos. Cadastro digital/presencial, aceite posterior, recusa, revogação, autorização por paciente, atualização de versão e bloqueio de notificações foram integrados ao runtime. Multipart cifra e valida o termo antes de associá-lo; falha descarta o arquivo e reconciliador remove órfãos antigos. Regressão 22/22 integrações, 15/15 testes Node, 2/2 Vitest e lint; após adicionar o caso de nova versão presencial, o arquivo de integração da BE-011 passou 2/2. P-01 segue portão jurídico, e o endpoint genérico `POST /v1/files` da BE-013 permanece sem publicação até existir recurso autorizável próprio.
