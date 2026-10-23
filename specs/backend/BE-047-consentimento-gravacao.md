# BE-047 - Consentimento específico de gravação

- **Software:** back
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** BE-045, BE-004
- **Requisitos cobertos:** RF-027, RN-011

## 1. Objetivo
Registrar aceite/recusa específico para gravação de teleconsulta, independente do termo geral, com versão, autoria e prova auditável.

## 2. Escopo
- Inclui: RecordingConsentEvent, versão do termo, aceite/recusa por paciente ou responsável e consulta de estado.
- NÃO inclui: captura/upload (BE-053), revogação/expurgo (BE-054) ou armazenamento clínico.

## 3. Contexto necessário
Ler DRS §3.4.4, Q-11/Q-12, `specs/shared/data-model.md#m3`, `specs/shared/api-contracts.md#m3` (recording-consent), `specs/shared/access-policy.md` e `specs/backend/architecture.md`.

## 4. Detalhamento
POST recording-consent valida sessão online ativa, consulta do titular, GuardianLink quando menor, termo vigente e consentimento de dados/teleconsulta ativos. Evento append-only guarda tipo grant/rejeição, versão, ator e instante; não guarda áudio. O estado vigente é consultável por BE-053/FE-034 sem presumir aceite a partir do consentimento de teleconsulta. Recusa não encerra vídeo nem prontuário, apenas impede gravação. Auditoria registra metadados de aceite/recusa e versão. Revogação posterior é BE-054.

## 5. Critérios de aceite
- [ ] Dado termo de teleconsulta aceito sem aceite de gravação, quando profissional iniciar gravação, então autorização é negada.
- [ ] Dado responsável sem GuardianLink ativo, quando consentir por dependente, então 403 e nenhum evento é criado.
- [ ] Dada versão vencida, quando aceitar, então 409 e o termo vigente é exigido.
- [ ] Dada recusa, quando continuar teleconsulta, então vídeo segue autorizado e gravação permanece proibida.

## 6. Testes esperados
Aceite/recusa separado, representação, versão, auditoria sem conteúdo e negação de gravação; lint.

## 7. Definition of Done
- [ ] Migração e contrato compartilhado respeitados; testes/lint passam, sem `tsc`.
- [ ] Nenhuma mídia é recebida nesta spec.

## 8. Suposições e pontos em aberto
Publicação do termo depende P-12; regras jurídicas de gravação e prazo dependem P-03.
