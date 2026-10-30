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
| `DataSubjectExport` | requestId, payloadEncrypted, sha256, createdAt | Pacote JSON M0 cifrado em repouso; acesso apenas ao solicitante autorizado e auditado, sem disponibilização de conteúdo ao DPO. Módulos futuros ampliam os campos exportados. | RF-005 |
| `MaintenanceWindow` | id, startsAt, endsAt, noticeReference, registeredAt, createdBy | Janela operacional registrada por admin, limite mensal e antecedência do aviso validados por parâmetros; `noticeReference` é evidência externa informada pelo operador, não comprovante automático de entrega. | RNF-006, BE-014 |
| `AuditEvent` | id, occurredAt, actorUserId/role, action, subjectPatientId opcional, resourceType/id, originIp/client, requestId, authorizationBasis, metadataSafe | Append-only, sem update/delete por API/admin; consulta também gera evento; retenção mínima RNF-015. `metadataSafe` não contém conteúdo clínico/segredo. | RF-032, RNF-015 |
| `Notification` e `NotificationPreference` | id, userId/patientId, category, channel, templateKey, deliveryStatus, preferenceSnapshot, scheduledAt/sentAt, failureReasonSafe | E-mail e portal na V1; mensagem essencial/marketing separadas; eventos não carregam conteúdo clínico. | RF-013, Q-18 |
| `FileObject` | id, category, ownerPatientId, linkedResourceType/id, storageKey, contentTypeDetected, size, sha256, encryptionKeyRef, scanStatus, createdAt, revokedAt | Nome interno aleatório, validação real de tipo/tamanho, cifrado em repouso; arquivo clínico não é exposto por caminho do disco. M0 cria infraestrutura, M2/M3 cria vínculos de negócio. | RF-020/026/027, RNF-014, Q-17 |

### Dependências de modelo M0

`User 1→0..1 PatientProfile`; `User 1→N GuardianLink ←N→1 PatientProfile`; `PatientProfile 1→N ConsentEvent ←1 ConsentDocumentVersion`; `User 1→N Session/Invitation/AuditEvent`; `PatientProfile 1→N DataSubjectRequest/FileObject`. Um paciente menor com vários responsáveis é possível somente após validação de política de guarda/parentesco; a relação permite isso sem conceder acesso automaticamente.

## M1

### Catálogo, agenda e importação

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

## M2

### Vínculo, prontuário, evolução e documentos

Os campos abaixo são contrato proposto para RF-016–023, RN-007–009/012 e Q-03/Q-04/Q-08/Q-10/Q-19/Q-21. BE-030 reconcilia consultas confirmadas no M1 antes de habilitar acesso clínico; nenhum papel administrativo recebe leitura clínica por possuir permissão de agenda. Evolução/documento finalizado e histórico importado são append-only; integridade depende também de restrição de UPDATE/DELETE no armazenamento e auditoria.

| Entidade | Campos/relações mínimos | Invariantes / origem |
| --- | --- | --- |
| `CareLink` | id, patientId, professionalId, source (`appointment/shared_case/substitution`), sourceAppointmentId?, startsAt, endsAt, status, grantedBy?, reason?, createdAt | Um vínculo individual por origem; janela pré/pós/no-show por `access.link_*`, cancelamento prévio encerra, novo atendimento renova; gestor concede substituição justificada sem ver conteúdo. Q-21/RN-007. |
| `EmergencyAccessGrant` | id, patientId, professionalId, justification, grantedAt, expiresAt, status, reviewedBy?, reviewedAt?, reviewOutcome? | Só profissional; expiração por `emergency_access.duration_minutes`, evento reforçado/aviso/admin-DPO e revisão posterior. RF-023. |
| `ClinicalRecord` | id, patientId único, recordNumber único, createdAt, lastEncounterAt | Prontuário persistente por paciente, retenção `privacy.clinical_retention_years`, mesmo se conta desativada/revogada. RF-016/RN-012. |
| `ClinicalEncounter` | id, appointmentId único, recordId, professionalId, startedAt, endedAt?, status | Representa atendimento clínico, inclusive teleconsulta; origem `Appointment` preservada; não confundir com reserva de agenda. RF-016/017, RNF-022. |
| `ClinicalEvolution` | id, encounterId, authorProfessionalId, status (`draft/finalized`), complaint, history, physicalExam, diagnosticHypotheses, conduct, diagnosisCodes, draftVersion, savedAt, finalizedAt?, contentHash? | Draft editável só pelo autor em atendimento autorizado; finalização congela conteúdo/autor/data/hash. Autosave RNF-008, adendo separado após qualquer prazo (Q-04). RF-017. |
| `EvolutionAddendum` | id, originalEvolutionId, authorProfessionalId, reason, correctionText, createdAt, contentHash | Só autor do original, justificativa obrigatória, append-only, original e todos adendos exibidos juntos; nunca UPDATE do final. RN-008/RNF-005. |
| `ClinicalAlert` e `ClinicalAlertEvent` | patientId, kind (`allergy/condition/continuous_medication/other`), term, substanceCode?, verificationState (`reported/confirmed`), active; eventos com author/reason/time | Alertas ativos no cabeçalho de todo atendimento; desativação justificada preserva histórico; alergia confrontada com prescrição. RF-018. |
| `DiagnosisCode`, `ProcedureCode` | code, description, terminology (`CID10/TUSS`), catalogVersion, active | Código+descrição locais pesquisáveis; TUSS opcional quando particular. Compatibilidade estrutural, sem endpoint FHIR/TISS. Q-08/RNF-022. |
| `ImportedHistory`, `ImportedHistoryAddendum` | recordId, originalDate?, origin, importedAt, importedBy, originalAuthor?, fileId?, contentReference?, checkedBy?, checkedAt?; adendo justificado | Origem visível; não equivale a evolução assinada; imutável e correção por adendo. Permissão de entrada clínica pendente P-11. Q-19/RNF-005. |
| `DocumentType` | code, label, requiredSignatureLevel (`simple/qualified`), active, templateVersion | Catálogo: prescrição, atestado, pedido de exame, declaração, relatório, encaminhamento. Padrão qualificada para tipos clínicos; declaração de comparecimento simples. Alterável por configuração autorizada/auditada. Q-10/RN-009. |
| `ClinicalDocument` | id, recordId, encounterId, typeId, authorProfessionalId, status (`draft/issued_dev/issued_valid/voided`), payloadVersion, fileId?, sha256?, signatureLevel?, signatureProvider?, signedAt?, verificationCode?, voidsDocumentId?, publishedAt? | Rascunho sem validade; dev mostra “sem validade jurídica”; emissão válida exige provedor compatível com nível do tipo. Emitido é imutável; anulação/nova emissão preserva anterior. RF-019–021, RN-009. |
| `MedicationCatalog` | code, name, activeSubstance, source, catalogVersion, active | Busca local para prescrição; fonte/licença/versão e regra para controlados aguardam P-13, sem prescrição clínica válida presumida. RF-019. |
| `PrescriptionItem` | documentId, medicationCode?/name, activeSubstance?, dose, route, frequency, quantity, instructions, allergyAcknowledgement? | Busca de medicamento e confronto com alerta; fonte/versão do catálogo e regras de controlados pendem P-13. RF-019. |
| `ExamOrder`, `ExamResult` | order: documentId, patientId, procedureCode?/description, indication, orderedAt, requesterId, status; result: orderId?, fileId, submittedBy, receivedAt, origin (`ordered/external`) | Pedido assinado por RN-009; resultado por paciente/recepção com arquivo validado, alerta ao solicitante; externo identificado, recepção não lê conteúdo após upload. RF-020. |
| `PatientPublication` | patientId, resourceType/id, publishedByProfessionalId, publishedAt, revokedAt?, visibilityKind (`document/result/orientation/confirmed_summary`) | Projeção explícita Q-03; publicação não decorre automaticamente da presença no prontuário; rascunho/hipótese/nota interna nunca publicáveis. RF-022. |

### Integridade e interoperabilidade estrutural

- `ClinicalRecord` e `ClinicalEncounter` têm IDs próprios; `Appointment` aponta ao horário, `ClinicalEncounter` ao atendimento ocorrido. Mapeamento futuro: `PatientProfile`→FHIR R4 Patient; `ProfessionalProfile`→Practitioner/PractitionerRole; `Appointment`→Appointment; `ClinicalEncounter`→Encounter; `ClinicalEvolution`→Composition/DocumentReference conforme estratégia futura; `DiagnosisCode`→Condition.code CID-10; `ExamOrder`→ServiceRequest com TUSS quando aplicável; `ExamResult`→DiagnosticReport/DocumentReference. São correspondências **estruturais**, não conformidade operacional nem endpoints FHIR na V1. TISS exige mapeamento de procedimento/identificadores, sem geração de guia.
- Retenção clínica vale a registros, documentos e resultados; gravação de vídeo pertence a M3 e tem política separada. `FileObject` de documento assinado não muda após emissão. A versão do catálogo CID/TUSS e o código/descrição usados ficam congelados no ato clínico, mesmo se tabela local evoluir.
- `ClinicalDocument` assinado por `DevSignatureProvider` usa `issued_dev` apenas em desenvolvimento. Esse status não se transforma em `issued_valid` por copiar o hash; produção bloqueia o adapter dev. P-02 define níveis finais e provedor real.

## M3 — teleconsulta, arquivos de sessão e gravação auxiliar

| Entidade | Campos mínimos / relação | Invariante |
| --- | --- | --- |
| `TeleconsultConsent` | `id,appointmentId,patientId,actorUserId,guardianLinkId?,termVersion,acceptedAt,revokedAt?` | Termo específico versionado, separado de `DataConsent`; responsável pode consentir pelo dependente. Recusa/revogação impede início ou encerra sessão (RF-024, RN-010). |
| `VideoSession` | `id,appointmentId,providerKind,status,createdAt,startedAt?,endedAt?,closedReason?` | Uma sessão ativa por consulta online confirmada; nunca criar para presencial. `providerKind=p2p_dev` V1, sem mídia persistida no sinalizador (RF-025, Q-12). |
| `VideoParticipant` | `id,sessionId,userId,role,joinedAt,leftAt?,connectionState` | Só paciente/responsável autorizado e profissional da consulta; heartbeat/reconexão são eventos, não autorização duradoura. |
| `SharedSessionFile` | `id,sessionId,fileId,uploadedBy,sharedAt,visibility,revokedAt?` | FileStorage categoria anexo, acesso pelo participante autorizado; arquivo clínico incorporado apenas por ato explícito do profissional, sujeito RN-012 (RF-026). |
| `RecordingConsentEvent` | `id,sessionId,patientId,actorId,termVersion,kind:grant|revoke,at` | Consentimento de gravação separado; eventos append-only, sem conteúdo de mídia (RF-027, RN-011). |
| `Recording` | `id,sessionId,fileId?,createdBy,startedAt,stoppedAt?,status:active|stopped|revoked|deleted,retentionUntil,revokedAt?,deletedAt?` | Material auxiliar, nunca `ClinicalEvolution`; acesso só ao profissional que atendeu e apenas com consentimento ativo. Retenção por `recording.retention_days`, independente de RN-012. |
| `RecordingDeletionJob` | `id,recordingId,requestedAt,dueAt?,completedAt?,state,backupSuppressionKey` | Revogação marca conteúdo e derivados inacessíveis imediatamente; exclusão física e rotação de backup usam parâmetros P-03. Auditoria guarda só metadados. |

Sinalização WebSocket troca oferta/resposta/ICE e estados transitórios; payload SDP/ICE não compõe prontuário nem `AuditEvent` com conteúdo. `VideoSessionProvider` e `RecordingStorage` são portas; adaptador P2P de desenvolvimento usa WebRTC/DTLS-SRTP e gravação do cliente MediaRecorder, sem processar mídia no servidor. TURN/STUN e desenho de rede aguardam P-10. A capacidade RNF-011 depende de medição BE-052.

## M4 — gestão e evidências

| Entidade | Campos mínimos / relação | Invariante |
| --- | --- | --- |
| `IndicatorSnapshot` (opcional) | `id,period,filtersHash,counts,generatedAt` | Apenas agregados; nenhum identificador de paciente ou conteúdo clínico, supressão de célula pequena. Pode ser consulta materializada sem tabela se medição justificar. |
| `ReportJob` | `id,requesterId,type,filters,status,requestedAt,finishedAt?,fileId?,rowCount?,errorCode?` | Exportação sensível por permissão; arquivo expira conforme política de FileStorage e download é auditado. |
| `AuditExportJob` | `id,requesterId,filters,reason,status,requestedAt,finishedAt?,fileId?` | Exportação de metadados AuditEvent; permissão revalidada ao consultar/baixar, emissão/download auditados. |
| `AuditEvent` (índices M4) | Índices por `occurredAt,actorId,patientId,eventType` | Append-only de M0; pesquisa/exportação nunca concede UPDATE/DELETE. |

## Correspondência estrutural futura

RNF-022/Q-08 exigem que identificadores e relações possam ser mapeados para FHIR R4/TISS **sem endpoints operacionais na V1**. Correspondências candidatas a documentar e validar no M2: paciente ↔ FHIR Patient, profissional ↔ Practitioner, agendamento ↔ Appointment, atendimento clínico ↔ Encounter. Evolução e documentos exigem mapeamento específico após o modelo clínico; não declarar conformidade FHIR por existir campo semelhante. CID-10 e TUSS terão código e descrição estruturados locais, com versão/fonte de catálogo registrada.

## Migração e retenção

- `ImportBatch` referencia layout de `import-templates.md`, origem, data, responsável, linhas aceitas/rejeitadas e chave idempotente. Nenhuma importação cria `User` de acesso ou dispara `Notification` (Q-19).
- `ImportedHistory` exibe origem, importador e “conferido por” quando houver; não equivale a evolução assinada, é imutável com correção por adendo.
- `ClinicalRecord`/documentos clínicos preservam-se por `privacy.clinical_retention_years` nunca abaixo de RN-012; `AuditEvent` por `privacy.audit_retention_years`. Identificação mínima, prova de consentimento e dados fiscais usam respectivamente `privacy.min_identity_retention_years`, `privacy.consent_evidence_retention_years` e `privacy.fiscal_retention_years`, sem default até P-01; nenhuma rotina de exclusão dessas categorias deve rodar antes da decisão jurídica. Gravação usa `recording.retention_days`, separada do prontuário (Q-11).
