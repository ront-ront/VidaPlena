# BE-053 - Recebimento e guarda de gravação auxiliar

- **Software:** back
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** BE-047, BE-013
- **Requisitos cobertos:** RF-027, RN-011, RNF-014

## 1. Objetivo
Receber gravação WebM capturada pelo cliente e guardá-la como material auxiliar cifrado com acesso restrito e retenção própria.

## 2. Escopo
- Inclui: RecordingStorage local via FileStorage, upload/validação, metadados e leitura do profissional que atendeu.
- NÃO inclui: captura MediaRecorder (FE-034), revogação/expurgo (BE-054), transcrição ou anexação automática ao prontuário.

## 3. Contexto necessário
Ler DRS §3.4.4, Q-11/Q-12/Q-17, `specs/shared/api-contracts.md#m3` (recordings), `specs/shared/data-model.md#m3`, `specs/shared/parameters.md` (recording.retention_days, file.recording_*) e `specs/backend/architecture.md`.

## 4. Detalhamento
POST recordings aceita somente profissional da consulta e RecordingConsentEvent grant vigente, revalidado no commit; rejeita upload iniciado antes do aceite ou após revogação. Validar WebM pelo conteúdo real, hash SHA-256, duração/tamanho por chaves file.recording_max_minutes/file.recording_max_mb; FileStorage categoria gravação cifra em repouso. Recording guarda autor, sessionId, startedAt/stoppedAt e retentionUntil por recording.retention_days. GET retorna metadados/link autenticado apenas ao profissional que atendeu com consentimento ainda ativo; paciente não tem acesso V1 até P-09. Não transcrever/processar mídia no servidor nem vincular à ClinicalEvolution. Auditoria registra acesso e metadados, nunca conteúdo.

## 5. Critérios de aceite
- [ ] Dado aceite específico ausente, quando enviar WebM, então 403 e nenhum objeto persiste.
- [ ] Dado arquivo acima de file.recording_max_mb ou duração acima de file.recording_max_minutes, quando enviar, então 422.
- [ ] Dada extensão WebM falsificada, quando enviar, então 422 após validação por conteúdo.
- [ ] Dado profissional diferente do que atendeu, quando consultar/download, então 403/404.
- [ ] Dado arquivo válido, quando guardar, então retentionUntil segue recording.retention_days e download é auditado.

## 6. Testes esperados
Autorização, consentimento no commit, MIME real, hash, tamanho/duração, retenção, isolamento de acesso e auditoria; lint.

## 7. Definition of Done
- [ ] Migração e portas/adaptadores corretos; testes/lint passam, sem `tsc`.
- [ ] Gravação não integra prontuário e MediaRecorder não roda no servidor.

## 8. Suposições e pontos em aberto
Retenção definitiva P-03; acesso do paciente P-09; RNF-014 continua parcial P-04.
