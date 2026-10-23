# Contratos de API e eventos — fonte única

**Estado:** M0 detalhado; seções M1–M4 serão acrescentadas aqui antes do lote correspondente. Rotas/payloads são **decisões técnicas propostas**, derivadas dos RF citados, e não nomes de endpoint encontrados no DRS. Backend e frontend devem consumir estes contratos sem redefini-los localmente.

## Convenções gerais

- Prefixo `/v1`; JSON UTF-8; IDs UUID opacos; timestamps ISO 8601 UTC; datas civis `YYYY-MM-DD`; valores monetários ausentes da V1. Resposta de coleção: `{ items: [...], nextCursor: string | null }`; limites de paginação vêm do contrato do recurso.
- Erro: `{ error: { code: string, message: string, details?: [{ field, reason }], requestId: string } }`. `message` em pt-BR compreensível; `details` não inclui dado clínico/segredo. `requestId` correlaciona log e auditoria.
- Códigos: `VALIDATION_ERROR` 400; `UNAUTHENTICATED` 401; `MFA_REQUIRED` 202 (desafio); `FORBIDDEN` 403; `NOT_FOUND_OR_FORBIDDEN` 404 para recurso clínico alheio; `CONFLICT` 409; `CONSENT_REQUIRED` 409; `RATE_LIMITED` 429; `SERVICE_UNAVAILABLE` 503. 422 pode representar arquivo inválido com campos detalhados. Sem enumeração de conta em recuperação/login.
- Listas sensíveis são filtradas no servidor. Toda alteração/consulta pessoal ou clínica relevante usa ator, escopo, requestId e evento de auditoria. Status de revogação/conta se aplica imediatamente; cache não pode servir dados revogados.
- JWT access token em memória do cliente, nunca `localStorage`; refresh token rotativo em cookie HttpOnly/Secure. Esta é decisão técnica de contrato para a V1. O domínio de implantação e a política SameSite/Origin/CSRF serão definidos em BE-001/BE-008 e validados antes da implementação, pois front/back são apps separados. Server Components podem buscar dados públicos; dados protegidos usam serviço autenticado seguro, sem token exposto em HTML.
- As rotas abaixo são contrato de alto nível; exemplos mostram campos essenciais e respostas. `shared/data-model.md`, `access-policy.md` e `parameters.md` definem semântica única. Arquivos binários usam upload/download separado e nunca base64 em JSON.

## M0 — autenticação e conta

| Método e rota | Requisição essencial | Sucesso | Erros específicos / autorização | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/auth/login` | `{ identifier: emailOuCpf, password }` | Paciente: 200 `{ status: "authenticated", accessToken, expiresAt, user }` + refresh cookie; interno: 202 `{ status: "mfa_required", challengeId, expiresAt }`. | 401 genérico; 423 conta temporariamente bloqueada; 429 limite; auditar toda tentativa. | RF-002, RNF-013 |
| `POST /v1/auth/mfa/verify` | `{ challengeId, code }` | 200 sessão/tokens como acima. | 401 código inválido/expirado, sem sessão; auditoria. Método/canal pendente P-05. | RF-002 |
| `POST /v1/auth/refresh` | Refresh cookie válido | 200 `{ accessToken, expiresAt }` + novo refresh cookie; token anterior revogado. | 401 expirado/reutilizado; reutilização revoga família de sessão. | Q-15, RNF-013 |
| `POST /v1/auth/logout` | Refresh cookie/sessão | 204; revoga sessão e limpa cookie. | 401 se não autenticado; idempotência sem expor existência. | RF-002 |
| `POST /v1/auth/recovery/request` | `{ identifier }` | 202 mensagem genérica idêntica para conta existente/inexistente. | 429 por `auth.reset_requests_per_hour`; envio via EmailSender e auditoria. | RF-003 |
| `POST /v1/auth/recovery/complete` | `{ token, newPassword }` | 204; revoga todas as sessões e token. | 400 senha inválida/reutilizada; 410 token usado/expirado. | RF-003 |
| `POST /v1/auth/invitations/accept` | `{ token, password }` | 200 `{ status: "active" }`; token consumido. | 400 política de senha; 410 convite expirado/usado. | RF-001/029, Q-05 |
| `POST /v1/auth/contact-verifications/complete` | `{ token }` | 204; novo e-mail/telefone torna-se oficial. | 410 token inválido; alteração/auditoria. | RF-005 |
| `GET /v1/me` | Sessão | 200 `{ id, roles, permissions, profile, consentState }` filtrado. | 401; sem conteúdo clínico. | RF-002/005 |
| `PATCH /v1/me/contact` | `{ email?, phone? }` | 202 confirmação pendente no novo canal; contato antigo continua oficial até prova. | 400 formato; 409 contato em uso. | RF-005 |

`identifier` aceita e-mail ou CPF sem revelar qual corresponde a uma conta. Campos de senha não aparecem em resposta/log. Para cadastro pela recepção, “credencial provisória” de RF-001 é implementada como link de uso único para definir senha, nunca senha temporária em texto claro; registrar como interpretação técnica de segurança.

## M0 — cadastro, dependentes e consentimento de dados

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/patient-registrations` | `{ mode: "self"|"dependent", patient: { fullName, birthDate, cpf, phone, email }, password?: string, guardianRelationship?: string, consent: { versionId, accepted: true } }` | 201 `{ patientId, accountState, consentEventId }`; `self` cria conta; `dependent` exige sessão do responsável. Cadastro+aceite atômicos. | 400 validação, 409 CPF duplicado/termo não vigente; recusa não cria cadastro digital. | RF-001/004, Q-05 |
| `POST /v1/patients` | Recepção: `multipart/form-data` com parte `data` JSON `{ patient, guardianUserId?, guardianRelationship?, onsiteConsent: { versionId, consentingPersonName, consentingRelationship?, accepted: true } }` e parte binária obrigatória `signedTerm` (PDF/JPG/PNG). | 201 `{ patientId, accountState, consentEventId, signedFileId }`; se adulto com contato, envia link para definir senha; menor exige responsável e parentesco. `FileStorage` valida/cifra o termo e `ConsentEvent` o referencia; falha de banco descarta o upload, falha de arquivo aborta o cadastro. | 400/409, 403 fora da recepção/admin; 422 sem termo assinado válido; não expor conteúdo clínico. | RF-001/004, Q-05 |
| `POST /v1/patients/{id}/onsite-consents` | Recepção: `multipart/form-data` com `data` JSON `{ versionId, consentingPersonName, consentingRelationship?, guardianUserId?, accepted: true }` e `signedTerm` obrigatório. | 201 `{ consentEventId, signedFileId, state }`; registra novo aceite presencial para paciente já cadastrado, sem alterar versão anterior. | 403 fora da recepção/admin; 404 sujeito inexistente; 409 versão não vigente; 422 arquivo inválido. | RF-004, Q-05 |
| `GET /v1/me/dependents` | Sessão do responsável | 200 `{ items: [{ patientId, fullName, relationship, status }] }`. | 401/403; só vínculos ativos. | Q-05 |
| `GET /v1/consent-documents/current?kind=data` | Sessão ou cadastro | 200 `{ id, version, body, effectiveAt }`. | 404 se não publicado; cadastro fica indisponível. | RF-004 |
| `POST /v1/admin/consent-documents` | `{ kind: "data", version, bodyReference, effectiveAt }` | 201 versão imutável. | 403 sem admin; publicação por admin é **suposição técnica** pendente de confirmação clínica/DPO. | RF-004 |
| `GET /v1/me/consents` | Sessão do paciente/responsável | 200 histórico por paciente autorizado, com versão, ato, data, origem. | 404 para dependente não vinculado. | RF-004 |
| `POST /v1/me/consents` | `{ patientId, versionId, action: "accept"|"refuse" }` | 201 `{ consentEventId, state }`; preserva histórico. | 409 versão não vigente; 403 sujeito alheio. | RF-004 |
| `POST /v1/me/consents/revoke` | `{ patientId, versionId, reason? }` | 201 `{ consentEventId, portalState: "restricted" }`; bloqueios imediatos. | 403 sujeito alheio; retenção legal preservada. | RF-004, Q-09 |

Versão publicada após aceite anterior exige novo aceite no próximo acesso antes de operações digitais dependentes. Documento presencial assinado é `FileObject` com autorização restrita e auditoria. A regra jurídica definitiva pós-revogação é P-01.

## M0 — administração, direitos do titular, notificações e arquivos

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/admin/users` | `{ email, fullName, role }` | 201 `{ userId, status: "invited", invitationExpiresAt }`; e-mail de convite. | 403: gestor só recepção/profissional; admin pode gestor/recepção/profissional; 409 conta existente. | RF-029, Q-05 |
| `GET /v1/admin/users` | Filtros `role,status,cursor` | 200 coleção de metadados, último acesso; sem dados clínicos. | 403; paginação. | RF-029 |
| `PATCH /v1/admin/users/{id}/status` | `{ status: "active"|"inactive" }` | 200 novo status; desativar revoga sessões. | 409 último admin; 403 fora do perfil; nunca DELETE. | RF-029 |
| `PUT /v1/admin/users/{id}/roles` | `{ roles: [...] }` | 200 papéis vigentes imediatamente e auditados. | 409 último admin; 403 concessão acima do ator. | RF-029 |
| `PUT /v1/admin/users/{id}/permissions/privacy.dpo` | `{ enabled: boolean }` | 200; auditoria e alerta se nenhum DPO. | 403 só admin; 400 se alvo sem papel interno aceito. | Q-20, RF-032 |
| `POST /v1/me/subject-requests` | `{ patientId, kind: "access"|"correction"|"export"|"erasure", description? }` | 201 `{ requestId, status, dueAt }`. | 403 sujeito alheio; 400 tipo inválido. | RF-005, RNF-016 |
| `GET /v1/me/subject-requests` | Sessão e cursor | 200 coleção dos próprios pedidos/dependentes. | 403/404 fora do escopo. | RF-005 |
| `GET /v1/privacy/subject-requests` | `privacy.dpo`; admin somente se não houver DPO designado, filtros de status/prazo | 200 fila sem conteúdo clínico. | 403 fora dessas condições. | Q-20 |
| `GET /v1/privacy/consents` | `privacy.dpo`, filtros `patientId,action,from,to,cursor` | 200 coleção de metadados de versão, ato, ator, data e origem; sem anexo ou conteúdo clínico. | 403 sem `privacy.dpo`, inclusive admin sem grant; consulta auditada. | Q-20, RF-004 |
| `POST /v1/privacy/subject-requests/{id}/resolve` | `{ decision, explanation, exportFileId? }` | 200 pedido concluído/auditado; eliminação sujeita RN-012. | 403 sem `privacy.dpo` ou admin de fallback; 409 pendências de retenção. | RF-005, RNF-016 |
| `GET /v1/me/notifications` | Sessão/cursor | 200 categoria, canal, horário, status e texto mínimo seguro. | 403 sujeito alheio. | RF-013, Q-18 |
| `PUT /v1/me/notification-preferences` | `{ channels: ["email","portal"], nonEssentialOptOut: boolean }` | 200 preferência; essenciais não podem ser desligadas por categoria. | 400 canal indisponível; após revogação nenhum envio não legal. | Q-18 |
| `POST /v1/files` | Multipart com categoria/escopo autorizado | 201 `{ fileId, detectedType, size, scanStatus }`. | 400/422 tipo/tamanho/quantidade; 403 escopo; `skipped_dev` só fora de produção. | Q-17, RNF-014 |
| `POST /v1/files/{id}/download-link` | Sessão | 200 `{ url, expiresAt }`, TTL `file.signed_url_ttl_seconds`. | 404/403 não autorizado; auditoria de emissão do link. | Q-17 |
| `GET /v1/file-download/{signedToken}` | Sessão + token ainda válido | 200 stream; `Content-Disposition` seguro; auditar cada download. | 401/403/410 expirado ou revogado. | Q-17 |

Nenhuma rota administrativa dá acesso a prontuário. A consulta de consentimentos para DPO é parte de BE-012; a tela de revisão conjunta é FE-038 em M4. A política de autorização está em `access-policy.md`.

## Eventos internos M0

O formato proposto é `{ eventId, type, occurredAt, actorId?, subjectId?, aggregateId, correlationId, payloadSafe }`. Entrega pelo dispatcher tem chave idempotente `(type, aggregateId, versão)`; falha registra status/retry sem duplicar lembrete. Tipos iniciais: `account.invited`, `auth.login_succeeded`, `auth.login_failed`, `auth.password_reset`, `contact.verification_requested`, `consent.accepted`, `consent.revoked`, `subject_request.opened`, `notification.failed`. Payloads não contêm dados clínicos; e-mail/portal recebem template com dados mínimos autorizados. A infraestrutura de jobs pode usar Redis disponível, mas a escolha concreta fica em BE-006 e é documentada em `backend/architecture.md`.

## M1 — catálogo, grade e disponibilidade

As rotas são propostas técnicas para RF-006–015/RF-028 e Q-06/Q-07/Q-19. `startsAt/endsAt` usam UTC ISO 8601; `localDate` e `clinicTimeZone` explicitam a apresentação. Intervalos são semiabertos. Toda lista tem paginação/cursor ou janela limitada; profissional/recepção/admin veem somente campos administrativos necessários. `SLOT_UNAVAILABLE` é 409 e inclui `alternatives` sem dado de outro paciente; `SCHEDULE_IMPACT_REVIEW` é 409 com IDs de consultas afetadas somente ao operador autorizado.

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `GET /v1/catalog/specialties` | `active=true`, `cursor` | 200 `{ items: [{id,code,name,modalities,durations}], nextCursor }` | Autenticado; sem dados pessoais. | RF-028/006 |
| `GET /v1/catalog/professionals` | `specialtyId?,modality?,cursor` | 200 `{ items: [{id,displayName,specialtyIds,modalities}], nextCursor }` | Não expor registro/contato privado. | RF-028/006 |
| `POST/PATCH /v1/admin/specialties[/{id}]` | `{ code,name,active,allowedModalities,defaultMinutesFirst,defaultMinutesReturn }` | 201/200 objeto versionado | 400 duração/modalidade inválida; 409 código duplicado/histórico; gestor/admin. Sem DELETE. | RF-028, RN-002 |
| `POST/PATCH /v1/admin/professionals[/{id}]` | `{ userId,councilType,councilNumber,councilRegion,specialtyIds,modalities,active,impactResolution? }` | 201/200 objeto versionado | 409 registro duplicado ou agenda futura não resolvida; gestor/admin. Inativação preserva histórico. | RF-028 |
| `GET /v1/rooms` | `active?,cursor` | 200 `{ items: [{id,name,active,capacity:1}], nextCursor }` | Leitura operacional; paciente não escolhe sala. | Q-07 |
| `POST/PATCH /v1/admin/rooms[/{id}]` | `{ name,active }` | 201/200 sala; capacidade fixa 1 | 409 nome duplicado/agenda futura incompatível; gestor/admin, sem DELETE. | Q-07, RF-008 |
| `GET /v1/professionals/{id}/schedule` | Janela de datas | 200 `{ rules,blocks,version,affectedAppointments }` filtrado | Profissional próprio, recepção, gestor/admin. | RF-011 |
| `PUT /v1/professionals/{id}/schedule` | `{ expectedVersion,rules,blocks,impactResolution? }` | 200 `{ version,affectedAppointmentsResolved }` | 409 grade sobreposta, versão antiga ou consulta afetada sem decisão; profissional próprio, recepção, gestor/admin com auditoria. | RF-011 |
| `GET /v1/availability` | `specialtyId,professionalId?,modality,from,to,visitType` | 200 `{ days: [{ localDate, slots: [{ startsAt,endsAt,professionalId,roomAvailable }] }], nearestAvailableAt? }` | 400 janela inválida; paciente só slots a partir de RN-003 e elegíveis; recepção vê faixa operacional. Não revela paciente ocupante. | RF-006, RN-002/003 |

`GET /availability` é fotografia, não promessa de reserva. Para presencial, `roomAvailable=true` significa existir sala ativa livre ao consultar; confirmação escolhe/revalida sala. Specialty sem remoto não retorna slot remoto. Grade, férias, feriados e bloqueios são aplicados antes de expor horários; `nearestAvailableAt` apoia estado vazio. Mudança de grade que afete consulta exige resolução pela rota de reagendamento/cancelamento; não remove reserva por simples edição.

## M1 — consultas, espera e operação do dia

`AppointmentSummary` contém `{ id,patientId,professionalId,specialtyId,modality,visitType,roomId?,startsAt,endsAt,status,bookingSource,virtualEntryPath? }`. Campo `virtualEntryPath` aponta para a rota de preparo M3 quando disponível; M1 não simula vídeo. `Idempotency-Key` é obrigatório em POST de confirmação/aceite/importação para evitar duplicação por retry. `confirmDuplicateSpecialty` é exigido quando há consulta futura na mesma especialidade. RN-003 (duas horas) vale para seleção direta do paciente; RN-004 (quatro horas) para autoalteração/cancelamento. Acesso do responsável passa por `GuardianLink` ativo.

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/appointments` | `{ patientId,professionalId,specialtyId,modality,visitType,startsAt,roomId?,confirmDuplicateSpecialty? }` + idempotency | 201 `{ appointment: AppointmentSummary,notificationState }`; sala sugerida automaticamente se presencial, recepção pode enviar `roomId` livre; remoto sem sala. | 409 `SLOT_UNAVAILABLE`, `DUPLICATE_SPECIALTY_WARNING`, `CONSENT_REQUIRED`; 403 paciente alheio/autoagendamento suspenso; 400 modalidade inválida. | RF-007/008, Q-05/07 |
| `GET /v1/me/appointments` | `status?,from?,to?,cursor` | 200 coleção própria/dependentes com histórico | 403/404 sujeito alheio; paginação. | RF-009/010 |
| `GET /v1/agenda/day` | `localDate,professionalId?,specialtyId?,status?,patientQuery?,cursor` | 200 `{ items: AppointmentSummary[],totals:{all,confirmed,noShow},nextCursor }` com dados administrativos mínimos | Recepção/gestor/admin; profissional só própria agenda; sem conteúdo clínico. | RF-014/015, UI-009 |
| `POST /v1/appointments/{id}/reschedule` | `{ startsAt,professionalId?,modality?,roomId?,reason?,expectedVersion }` + idempotency | 200 `{ appointment, previousSlotReleased:true }`; histórico vinculado | 409 slot/prazo/versão, mantendo original; recepção registra razão fora de RN-004; paciente só próprio/dependente. | RF-009 |
| `POST /v1/appointments/{id}/cancel` | `{ reason?,origin,expectedVersion }` + idempotency | 200 `{ appointment,status:"cancelled",waitlistTriggered }` | 409 prazo/estado; paciente após RN-004 é redirecionado à recepção; profissional/clínica registra origem. | RF-010 |
| `POST /v1/waitlist` | `{ patientId,specialtyId,modality,dateFrom,dateTo,timePreferences }` | 201 `{ entryId,queuedAt,status }` | 403 sujeito alheio; 409 pedido duplicado; paciente/recepção. | RF-012 |
| `GET /v1/waitlist` | `patientId?,specialtyId?,status?,cursor` | 200 coleção própria ou operacional com posição/status | Recepção vê fila; paciente só própria/dependente. | RF-012 |
| `DELETE /v1/waitlist/{id}` | ID de entrada | 204, cancela oferta ainda não aceita | 403/404 sujeito alheio; histórico/auditoria preservados. | RF-012 |
| `POST /v1/waitlist/offers/{id}/accept` | `{ patientId }` + idempotency | 201 `{ appointment }`, hold vira reserva confirmada | 409 `OFFER_EXPIRED`/`SLOT_UNAVAILABLE`; só destinatário autorizado; não duplica. | RF-012/008 |
| `POST /v1/appointments/fit-ins` | Mesmo núcleo de `POST /appointments` + `{ reason }` | 201 consulta `bookingSource:"fit_in"` fora da grade, mas intervalo livre de profissional/sala | 403 só recepção/gestor; 400 sem justificativa; 409 colisão. | RF-012, Q-06 |
| `POST /v1/appointments/{id}/attendance-response` | `{ response:"confirm"|"cannot_attend" }` | 200 estado de resposta; impossibilidade oferece RF-010 | 403 fora do paciente/responsável; 409 cancelada/encerrada. | RF-013 |
| `POST /v1/appointments/{id}/check-in` | `{ arrivedAt? }` | 200 `{ status:"waiting",arrivedAt,lateFlag }` | 403 só recepção; 409 data/estado incompatível; fila do profissional atualiza. | RF-014 |
| `GET /v1/professionals/me/queue` | `localDate` | 200 coleção de pacientes próprios em espera, ordenada por horário previsto | 403 outros perfis; sem exposição de prontuário antes de vínculo. | RF-014 |
| `POST /v1/appointments/{id}/absence` | `{ kind:"unjustified"|"justified"|"clinic_fault",explanation? }` | 200 `{ status:"no_show",kind,autoBookingSuspended }` | 403 só recepção; 409 antes de `appointment.noshow_after_minutes`/com check-in; marcação manual V1. | RF-015, RN-006 |
| `PATCH /v1/appointments/{id}/absence` | `{ kind,explanation }` | 200 ausência corrigida com histórico preservado | 403 só recepção/gestor; 400 sem justificativa de correção. | RF-015 |

Mudanças de status são monotônicas salvo correção auditada de ausência. A conclusão clínica pertence a M2; M1 registra `confirmed`, `waiting`, `no_show`, `cancelled` e estados operacionais necessários. Lembretes de `reminder.schedule_hours_before` são jobs idempotentes, até dois por consulta; reprogramar/cancelar invalida jobs antigos. Mensagem essencial segue Q-18, mas revogação de dados bloqueia envio mesmo se a mensagem já estiver enfileirada, salvo exceção legal aprovada. Falha gera retry e sinaliza recepção, sem duplicar entrega. Oferta da espera usa `SlotReservation.held` até `waitlist.offer_ttl_minutes`; expiração libera hold e avança a próxima pessoa elegível na ordem de entrada.

## M1 — CSV demonstrativo

Layouts CSV, colunas e idempotência são definidos **somente** em `shared/import-templates.md`. As rotas não criam conta, consentimento ou notificação por importação e exigem admin/gestor. `migration.cutoff_date` permanece pendente para dados reais; demonstração usa dados fictícios.

| Método e rota | Requisição essencial | Sucesso | Erros / acesso |
| --- | --- | --- | --- |
| `POST /v1/imports/{patients|appointments}/preview` | CSV multipart + `sourceSystem` | 200 `{ batchId,fileHash,rows:[{line,status,errors,duplicateOf?}],accepted,rejected }`; nenhuma entidade de negócio gravada | 400 layout/encoding; relatório sem gravar linha de negócio; 403 fora admin/gestor. |
| `POST /v1/imports/{patients|appointments}/{batchId}/confirm` | `{ expectedFileHash }` + idempotency | 200 `{ batchId,imported,rejected,rows:[{line,status,targetId?,errors}] }` | 409 lote alterado/colisão, linha rejeitada com motivo; reimportação não duplica. |
| `GET /v1/imports/{batchId}` | ID do lote | 200 preview/relatório final, origem/importador/data e status | 403 fora admin/gestor; 404 lote alheio/inexistente. |

Importação de agenda usa a mesma barreira BE-020; horário histórico importado não vira evolução assinada. Eventos internos M1: `appointment.confirmed/rescheduled/cancelled/checked_in/no_show`, `waitlist.offer_created/expired/accepted`, `reminder.scheduled/sent/failed`, `import.previewed/confirmed`. Payloads seguem o envelope seguro de M0 e a chave idempotente por agregado/versão; nenhum evento revela conteúdo clínico.

## Reservas de contrato M2–M4

- **M2:** vínculo, prontuário, evolução/adendo, alertas, CID-10/TUSS, assinatura, prescrição/exame/documentos e projeção paciente; respostas devem filtrar por vínculo e publicação antes de FE-021.
- **M3:** consentimentos distintos, WebSocket de sinalização (join/offer/answer/ICE/leave/error), pré-teste, arquivos e gravação/expurgo; nenhuma mídia passa pelo servidor de sinalização na V1.
- **M4:** indicadores, relatórios, consulta de auditoria e DPO; exportação sensível registra escopo e ator.

Cada seção será completada **neste arquivo** no início do respectivo lote. Nenhum BE/FE poderá inventar um contrato próprio ausente daqui.
