# BE-054 - Revogação e expurgo de gravação

- **Software:** back
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** BE-053, BE-004
- **Requisitos cobertos:** RF-027, RN-011, RNF-014

## 1. Objetivo
Interromper o acesso à gravação imediatamente após revogação e executar exclusão de conteúdo/derivados com prova de metadados.

## 2. Escopo
- Inclui: evento revoke, bloqueio lógico, invalidação de links, RecordingDeletionJob, expurgo/retensão e exclusão em backup.
- NÃO inclui: apagar evolução assinada, conservar conteúdo em auditoria ou definir prazos jurídicos sem P-03.

## 3. Contexto necessário
Ler DRS §3.4.4, Q-11, `specs/shared/api-contracts.md#m3` (recordings/revoke), `specs/shared/data-model.md#m3`, `specs/shared/parameters.md` (recording.*, backup.revoked_content_rotation_days), `specs/backend/architecture.md` e P-03/P-04.

## 4. Detalhamento
POST revoke valida titular/GuardianLink, registra RecordingConsentEvent revoke e em uma transação marca Recording e derivados inacessíveis, invalida tokens e cria RecordingDeletionJob. Publicar evento para FE-034 parar MediaRecorder imediatamente; mesmo sem entrega do evento, servidor rejeita novos uploads pelo estado no commit. Exclusão física usa recording.delete_after_revocation_days depois de definido P-03; rotação de backup usa backup.revoked_content_rotation_days e lista de supressão ao restaurar. Retenção normal usa recording.retention_days. Job é idempotente/reexecutável e registra requestedAt/completedAt/deletedAt, mas auditoria conserva só existência, autoria, consentimento, revogação e data de exclusão. Evoluções escritas assinadas persistem. Sem prazos P-03, o bloqueio lógico é implementável, mas expurgo produtivo fica bloqueado.

## 5. Critérios de aceite
- [ ] Dada revogação, quando confirmar transação, então mídia/derivados e links antigos ficam inacessíveis imediatamente.
- [ ] Dado upload simultâneo à revogação, quando transações terminarem, então nenhum arquivo permanece acessível.
- [ ] Dado job repetido, quando executar, então não recria conteúdo nem duplica exclusão.
- [ ] Dada restauração de backup, quando aplicar lista de supressão, então conteúdo revogado não reaparece.
- [ ] Dada evolução assinada, quando revogar gravação, então evolução permanece sem alteração.

## 6. Testes esperados
Corrida upload/revogação, 410/link invalidado, idempotência, derivados, restauração sem conteúdo, retenção e auditoria de metadados; lint.

## 7. Definition of Done
- [ ] Expurgo físico só habilitado com prazos P-03 aprovados; testes/lint passam, sem `tsc`.
- [ ] Nenhum áudio/transcrição entra em AuditEvent.

## 8. Suposições e pontos em aberto
P-03 define prazo físico e rotação máxima; P-04 mantém RNF-014 parcial.
