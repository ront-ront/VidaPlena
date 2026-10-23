# Modelo de dados compartilhado

**Fonte:** DRS §§2–4, decisões em `04-open-questions.md` e contratos técnicos propostos aqui. O schema Prisma será criado do zero (Q-23). Nomes em inglês abaixo são **decisões técnicas propostas** para a implementação; regras e relações vêm dos IDs citados. Este documento é a fonte única para BE/FE; migrations concretas aparecem nas specs BE correspondentes.

## Convenções de integridade

- IDs opacos UUID, datas/hora em UTC no armazenamento e apresentação pt-BR/fuso da clínica no front. CPF normalizado e único por paciente; e-mail normalizado/único por conta ativa ou inativa, com política de reuso pendente de decisão. Não inserir dados clínicos em logs, tokens ou notificações.
- `createdAt`, `updatedAt` quando aplicável; registros clínicos finalizados, consentimentos, auditoria, documentos emitidos e agendamentos cancelados não são apagados fisicamente. Soft delete/status para contas, profissionais, salas e especialidades com histórico.
- Chaves estrangeiras e constraints no PostgreSQL; operações compostas (cadastro + consentimento; reservar profissional + sala; mutação + auditoria) em transação. Indexar identificadores e filtros de leitura usados nas metas RNF-009/010.
- Campos sensíveis e arquivos cifrados em repouso conforme RNF-014. A estratégia de chaves é detalhada em `backend/architecture.md`; segredo nunca no banco junto do dado cifrado.

## M0 — identidade, consentimento, auditoria e infraestrutura

| Entidade | Campos mínimos | Relações e invariantes | Origem |
| --- | --- | --- | --- |
| `User` | id, email, phone, passwordHash, status (`invited/active/locked/inactive`), emailVerifiedAt, failedLoginCount, lockUntil, credentialVersion, createdAt | E-mail único normalizado; inativação não exclui; senha só hash; paciente/responsável pode não ter `PatientProfile`. | RF-001–003/029, Q-05/Q-15 |
| `Role`, `Permission`, `UserRoleAssignment`, `UserPermissionGrant` | códigos únicos, userId, roleId/permissionId, grantedBy, grantedAt, revokedAt | Cinco papéis; `privacy.dpo` é concessão direta só a admin/gestor; última conta admin protegida; grants auditados. | RF-029, RNF-012, Q-20 |
| `PatientProfile` | id, userId opcional, fullName, birthDate, cpf, phone, email, status, createdAt | CPF único; cadastro assistido pode não ter login; paciente menor pode estar ligado só a responsável. Campos legais corrigidos por fluxo auditado. | RF-001/005, Q-05 |
| `GuardianLink` | id, guardianUserId, patientId, relationship, startedAt, endedAt, status, evidenceFileId opcional | Um responsável pode ter vários dependentes; acesso só para vínculo ativo. Parentesco e evidência vinculados ao consentimento quando presencial. | Q-05, RF-001/004 |
| `Invitation`, `OneTimeToken` | id, userId, purpose, tokenHash, issuedAt, expiresAt, consumedAt, attemptCount | Token em claro nunca persistido; uso único; convite/verificação/recuperação com validades de `parameters.md`. | RF-001–003/029, Q-15 |
| `Session`, `PasswordHistory` | id, userId, refreshTokenHash, issuedAt, lastActivityAt, expiresAt, revokedAt; hash anterior | Refresh rotativo; logout, recuperação, bloqueio e revogação encerram sessões relevantes; política de histórico depende de parâmetro pendente. | RF-002/003, RNF-013 |
| `ConsentDocumentVersion` | id, kind (`data/teleconsult/recording`), version, bodyReference, effectiveAt, publishedBy, publishedAt | Versão publicada não é sobrescrita; conteúdo exibido corresponde ao que foi aceito. M0 implementa tipo `data`; demais vêm M3. | RF-004/024/027 |
| `ConsentEvent` | id, patientId, documentVersionId, action (`accept/refuse/revoke`), actorUserId, source (`portal/onsite`), occurredAt, guardianLinkId opcional, consentingPersonName, consentingRelationship opcional, signedFileId opcional | Histórico append-only; snapshot do nome/parentesco de quem consentiu, ator que registrou, data, versão e origem; `signedFileId` é obrigatório no aceite presencial e referencia `FileObject` da categoria `anexo`. Revogação não apaga aceite. | RF-004, Q-05/Q-09 |
| `DataSubjectRequest` | id, subjectPatientId, requesterUserId, kind (`access/correction/export/erasure`), status, submittedAt, dueAt, handledBy, resolution, completedAt | Prazo RNF-016; fila visível por `privacy.dpo`/admin; exportação/eliminação condicionadas à retenção. | RF-005, RNF-016, Q-20 |
| `AuditEvent` | id, occurredAt, actorUserId/role, action, subjectPatientId opcional, resourceType/id, originIp/client, requestId, authorizationBasis, metadataSafe | Append-only, sem update/delete por API/admin; consulta também gera evento; retenção mínima RNF-015. `metadataSafe` não contém conteúdo clínico/segredo. | RF-032, RNF-015 |
| `Notification` e `NotificationPreference` | id, userId/patientId, category, channel, templateKey, deliveryStatus, preferenceSnapshot, scheduledAt/sentAt, failureReasonSafe | E-mail e portal na V1; mensagem essencial/marketing separadas; eventos não carregam conteúdo clínico. | RF-013, Q-18 |
| `FileObject` | id, category, ownerPatientId, linkedResourceType/id, storageKey, contentTypeDetected, size, sha256, encryptionKeyRef, scanStatus, createdAt, revokedAt | Nome interno aleatório, validação real de tipo/tamanho, cifrado em repouso; arquivo clínico não é exposto por caminho do disco. M0 cria infraestrutura, M2/M3 cria vínculos de negócio. | RF-020/026/027, RNF-014, Q-17 |

### Dependências de modelo M0

`User 1→0..1 PatientProfile`; `User 1→N GuardianLink ←N→1 PatientProfile`; `PatientProfile 1→N ConsentEvent ←1 ConsentDocumentVersion`; `User 1→N Session/Invitation/AuditEvent`; `PatientProfile 1→N DataSubjectRequest/FileObject`. Um paciente menor com vários responsáveis é possível somente após validação de política de guarda/parentesco; a relação permite isso sem conceder acesso automaticamente.

## M1 — catálogo, agenda e importação

As entidades abaixo são propostas técnicas de persistência para RF-006–015/RF-028 e Q-06/Q-07/Q-19. BE-016–029 criam migrations próprias, sem reescrever a migration de identidade. Horários são intervalos UTC semiabertos `[startsAt, endsAt)`; horários adjacentes não se sobrepõem. O fuso da clínica é aplicado somente ao construir/exibir dia civil e recorrência.

| Entidade | Campos e relações mínimos | Integridade / origem |
| --- | --- | --- |
| `Specialty` | id, code, name, active, allowedModalities, `defaultMinutesFirst`, `defaultMinutesReturn`, createdAt/updatedAt | Código único; duração positiva por tipo, alterável por gestor; inativação preserva histórico. RF-028, RN-002. |
| `ProfessionalProfile` e `ProfessionalSpecialty` | id, userId, councilType, councilNumber, councilRegion, active; relação com `Specialty`, modalidades, data de vínculo | Registro profissional único por conselho/região/número; só perfil interno profissional; inativação exige decisão sobre agenda futura. RF-028. |
| `Room` | id, name, active, capacity=1, createdAt/updatedAt | Nome único entre salas ativas; nunca DELETE, sem equipamento/compatibilidade na V1. Q-07. |
| `AvailabilityRule`, `ScheduleBlock` | professionalId, weekday, start/end local, effectiveFrom/To, modality, publishedVersion; bloqueio com start/end UTC, kind (`break/vacation/holiday/emergency`), actor, reason | Faixas válidas sem sobreposição dentro da grade; mudança que atinge consulta confirmada exige resolução explícita; publicação versionada. RF-011. |
| `Appointment` | id, patientId, professionalId, specialtyId, modality, visitType, roomId opcional, startsAt, endsAt, status, createdBy, bookingSource, parentAppointmentId opcional, reason opcional, importedOrigin opcional, createdAt/updatedAt | Presencial exige sala ativa, remoto exige `roomId=null`; duração derivada de especialidade/tipo no momento da confirmação; status nunca apaga registro. RF-007–010. |
| `SlotReservation` | id, professionalId, roomId opcional, startsAt, endsAt, state (`held/confirmed/released`), appointmentId opcional, offerId opcional, expiresAt opcional | Fonte única de ocupação para consulta e oferta de espera. Constraint PostgreSQL GiST/exclusion parcial por profissional e por sala em estados `held/confirmed`; colisão inclui encaixe. Hold expirado é liberado atomicamente antes de nova tentativa. RF-008/RN-001. |
| `AppointmentHistory` | id, appointmentId, previous/new status/time/professional/room, actorId, reason, occurredAt | Append-only; reagendamento mantém ligação ao original e preserva estado anterior; cancelamento/no-show/justificativa auditados. RF-009/010/015. |
| `WaitlistEntry`, `WaitlistOffer` | patientId, specialtyId, modality, dateRange/timePreferences, queuedAt, status; offer com entryId, slotReservationId, offeredAt, expiresAt, status | Ordenação por `queuedAt,id`; uma oferta ativa por slot; TTL via `waitlist.offer_ttl_minutes`; aceitação usa BE-020. RF-012, Q-16. |
| `CheckIn`, `Absence` | appointmentId, arrivedAt/recordedBy, lateFlag; ausência com kind (`unjustified/justified/clinic_fault`), explanation, decidedBy, decidedAt | Um check-in efetivo por consulta; ausência não conta contra paciente se justificada/falha da clínica; alteração gera histórico. RF-014/015, RN-006. |
| `ImportBatch`, `ImportRow` | kind (`patients/appointments`), sourceSystem, fileHash, status, previewReport, confirmedAt, importedBy; linha com externalId, status, errorCodes, targetId | `sourceSystem+kind+externalId` único; preview sem gravação de entidade; confirmação revalida; origem/data/importador em toda linha; sem conta/notificação. Q-19. |

`SlotReservation` é a barreira de integridade: uma consulta confirmada possui exatamente uma reserva `confirmed`; presencial tem `roomId`, remoto não. A troca de horário/profissional/sala cria a nova reserva e libera a antiga na mesma transação; se falhar, preserva a antiga. Oferta de espera usa `held` e não vira atendimento até aceite transacional. Disponibilidade subtrai reservas e bloqueios; a grade sozinha não garante exclusão. O código de aplicação trata violação da constraint como `SLOT_UNAVAILABLE`, sem resposta parcial. Não existe exceção para encaixe.

## M2–M4 — entidades reservadas para completar por lote

Estas entidades derivam do DRS e das decisões, mas seus atributos de API/ORM serão detalhados no **mesmo documento** antes das respectivas specs. Não criar schema especulativo no M0 além do necessário.

| Marco | Entidades | Invariante principal / origem |
| --- | --- | --- |
| M2 | `CareLink`, `ClinicalRecord`, `ClinicalEvolution`, `EvolutionAddendum`, `ClinicalAlert`, `DiagnosisCode`, `ProcedureCode`, `DocumentType`, `ClinicalDocument`, `ExamOrder`, `ExamResult`, `ImportedHistory` | Vínculo temporal individual, autoria, finalização imutável/adendo, histórico clínico e documentos rastreados (RF-016–023, RN-007–009/012, Q-03/Q-10/Q-21). |
| M3 | `VideoSession`, `VideoParticipant`, `SharedSessionFile`, `RecordingConsentEvent`, `Recording`, `RecordingDeletionJob` | Consentimento de teleconsulta/gravação separados, sala ligada à consulta, metadados de início/fim, expurgo e retenção própria (RF-024–027, Q-11/Q-12). |
| M4 | `IndicatorSnapshot` opcional, `ReportJob`, índices de `AuditEvent` | Indicadores agregados sem reidentificação, exportação auditada e processamento assíncrono (RF-030–032). |

## Correspondência estrutural futura

RNF-022/Q-08 exigem que identificadores e relações possam ser mapeados para FHIR R4/TISS **sem endpoints operacionais na V1**. Correspondências candidatas a documentar e validar no M2: paciente ↔ FHIR Patient, profissional ↔ Practitioner, agendamento ↔ Appointment, atendimento clínico ↔ Encounter. Evolução e documentos exigem mapeamento específico após o modelo clínico; não declarar conformidade FHIR por existir campo semelhante. CID-10 e TUSS terão código e descrição estruturados locais, com versão/fonte de catálogo registrada.

## Migração e retenção

- `ImportBatch` referencia layout de `import-templates.md`, origem, data, responsável, linhas aceitas/rejeitadas e chave idempotente. Nenhuma importação cria `User` de acesso ou dispara `Notification` (Q-19).
- `ImportedHistory` exibe origem, importador e “conferido por” quando houver; não equivale a evolução assinada, é imutável com correção por adendo.
- `ClinicalRecord`/documentos clínicos preservam-se por `privacy.clinical_retention_years` nunca abaixo de RN-012; `AuditEvent` por `privacy.audit_retention_years`. Identificação mínima, prova de consentimento e dados fiscais usam respectivamente `privacy.min_identity_retention_years`, `privacy.consent_evidence_retention_years` e `privacy.fiscal_retention_years`, sem default até P-01; nenhuma rotina de exclusão dessas categorias deve rodar antes da decisão jurídica. Gravação usa `recording.retention_days`, separada do prontuário (Q-11).
