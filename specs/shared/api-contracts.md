# Contratos de API e eventos — fonte única

**Estado:** M0–M4 detalhados por milestone. Rotas/payloads são **decisões técnicas propostas**, derivadas dos RF citados, e não nomes de endpoint encontrados no DRS. Backend e frontend devem consumir estes contratos sem redefini-los localmente.

## Convenções gerais

- Prefixo `/v1`; JSON UTF-8; IDs UUID opacos; timestamps ISO 8601 UTC; datas civis `YYYY-MM-DD`; valores monetários ausentes da V1. Resposta de coleção: `{ items: [...], nextCursor: string | null }`; limites de paginação vêm do contrato do recurso.
- Erro: `{ error: { code: string, message: string, details?: [{ field, reason }], requestId: string } }`. `message` em pt-BR compreensível; `details` não inclui dado clínico/segredo. `requestId` correlaciona log e auditoria.
- Códigos: `VALIDATION_ERROR` 400; `UNAUTHENTICATED` 401; `MFA_REQUIRED` 202 (desafio); `FORBIDDEN` 403; `NOT_FOUND_OR_FORBIDDEN` 404 para recurso clínico alheio; `CONFLICT` 409; `CONSENT_REQUIRED` 409; `RATE_LIMITED` 429; `SERVICE_UNAVAILABLE` 503; `TOKEN_EXPIRED` 410 para link inválido/usado/expirado. 422 pode representar arquivo inválido com campos detalhados. Sem enumeração de conta em recuperação/login.
- Listas sensíveis são filtradas no servidor. Toda alteração/consulta pessoal ou clínica relevante usa ator, escopo, requestId e evento de auditoria. Status de revogação/conta se aplica imediatamente; cache não pode servir dados revogados.
- JWT access token em memória do cliente, nunca `localStorage`; refresh token rotativo em cookie HttpOnly/Secure. Esta é decisão técnica de contrato para a V1. P-12 aprova mesmo site para front/API, cookie SameSite=Lax, HttpOnly/Secure, allowlist exata de Origin e CSRF vinculado à sessão; domínio real vem da configuração e deve ser verificado na implantação. Server Components podem buscar dados públicos; dados protegidos usam serviço autenticado seguro, sem token exposto em HTML.
- As rotas abaixo são contrato de alto nível; exemplos mostram campos essenciais e respostas. `shared/data-model.md`, `access-policy.md` e `parameters.md` definem semântica única. Arquivos binários usam upload/download separado e nunca base64 em JSON.

## M0 — autenticação e conta

### Operação e observabilidade (BE-014)

`GET /health/live` responde `200 {status:"alive"}` enquanto o processo HTTP está vivo. `GET /health/ready` testa o PostgreSQL essencial com timeout `ops.readiness_timeout_ms` e responde `200 {status:"ready"}` ou `503 {status:"unavailable"}`, sem detalhes da dependência. Ambos ficam fora do prefixo `/v1` para sondas de infraestrutura. `GET /v1/admin/ops/metrics` requer sessão admin com MFA e devolve texto Prometheus agregado por rota template, método e status; não usa URL concreta, query ou identificadores como rótulo. `POST /v1/admin/ops/maintenance-windows` requer admin `{startsAt,endsAt,noticeReference}` e responde 201 `{id,startsAt,endsAt,registeredAt,noticeReference}`; só registra se a antecedência cumprir `ops.maintenance_notice_hours` e o total de janelas no mês UTC não ultrapassar `ops.maintenance_max_hours_month`. `GET /v1/admin/ops/maintenance-windows` lista as 100 janelas recentes com `createdBy`. A referência do aviso é evidência informada pelo operador, sem envio automatizado nesta spec. A coleta, o destino de alertas e a prova de entrega do aviso produtivos dependem de P-07.

| Método e rota | Requisição essencial | Sucesso | Erros específicos / autorização | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/auth/login` | `{ identifier: emailOuCpf, password }` | Paciente: 200 `{ status: "authenticated", accessToken, expiresAt, user }` + refresh cookie; interno: 202 `{ status: "mfa_required", challengeId, expiresAt, enrollmentRequired }`. | 401 genérico; 423 conta temporariamente bloqueada; 429 limite; auditar toda tentativa. | RF-002, RNF-013 |
| `POST /v1/auth/mfa/enroll` | `{ challengeId }` recebido após senha válida; somente ainda não matriculado | 200 `{secret,otpauthUri}` para cadastrar aplicativo; não concede sessão. | 401 desafio inválido/expirado/conta bloqueada; `Cache-Control: no-store`; nunca logar segredo. | P-05, BE-008 |
| `POST /v1/auth/mfa/verify` | `{ challengeId, code }` | 200 sessão/tokens como acima. | 401 código inválido/expirado, sem sessão; auditoria. TOTP por aplicativo aprovado em P-05. | RF-002 |
| `POST /v1/auth/refresh` | Refresh cookie válido | 200 `{ accessToken, expiresAt }` + novo refresh cookie; token anterior revogado. | 401 expirado/reutilizado; reutilização revoga família de sessão. | Q-15, RNF-013 |
| `POST /v1/auth/logout` | Refresh cookie/sessão | 204; revoga sessão e limpa cookie. | 401 se não autenticado; idempotência sem expor existência. | RF-002 |
| `POST /v1/auth/recovery/request` | `{ identifier }` | 202 mensagem genérica idêntica para conta existente/inexistente. | 429 por `auth.reset_requests_per_hour`; envio via EmailSender e auditoria. | RF-003 |
| `POST /v1/auth/recovery/complete` | `{ token, newPassword }` | 204; revoga todas as sessões e token. | 400 senha inválida/reutilizada; 410 token usado/expirado. | RF-003 |
| `POST /v1/auth/invitations/inspect` | `{ token }` | 200 `{fullName,roles,expiresAt}`; identidade mínima do convite. | 410 inválido/usado/expirado; não consome. | RF-029, BE-007 |
| `POST /v1/auth/invitations/accept` | `{ token, password }` | 200 `{ status: "active" }`; token consumido. | 400 política de senha; 410 convite expirado/usado. | RF-001/029, Q-05 |
| `POST /v1/auth/contact-verifications/complete` | `{ token }` | 204; novo e-mail torna-se oficial após prova no endereço novo. | 410 token inválido; alteração/auditoria. | RF-005 |
| `GET /v1/me` | Sessão | 200 `{ id, roles, permissions, profile, consentState }` filtrado. | 401; sem conteúdo clínico. | RF-002/005 |
| `PATCH /v1/me/contact` | `{ email }` | 202 confirmação pendente no e-mail novo; contato antigo continua oficial até prova. | 400 formato; 409 contato em uso. | RF-005, P-12 |
| `POST /v1/onsite-contact/phone` | Recepção/admin `{ userId, phone }` após confirmação presencial da pessoa. | 200 `{ status: "confirmed" }`; novo telefone fica oficial imediatamente, ato auditado. | 403 fora da recepção/admin; 404 usuário não paciente. | RF-005, P-12 |

`identifier` aceita e-mail ou CPF sem revelar qual corresponde a uma conta. Campos de senha não aparecem em resposta/log. Para cadastro pela recepção, “credencial provisória” de RF-001 é implementada como link de uso único para definir senha, nunca senha temporária em texto claro; registrar como interpretação técnica de segurança.

## M0 — cadastro, dependentes e consentimento de dados

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/patient-registrations` | `{ mode: "self"|"dependent", patient: { fullName, birthDate, cpf, phone, email }, password?: string, guardianRelationship?: string, consent: { versionId, accepted: true } }` | 201 `{ patientId, accountState, consentEventId }`; `self` cria conta; `dependent` exige sessão do responsável. Cadastro+aceite atômicos. | 400 validação, 409 CPF duplicado/termo não vigente; recusa não cria cadastro digital. | RF-001/004, Q-05 |
| `POST /v1/patients` | Recepção: `multipart/form-data` com parte `data` JSON `{ patient, guardianUserId?, guardianRelationship?, onsiteConsent: { versionId, consentingPersonName, consentingRelationship?, accepted: true } }` e parte binária obrigatória `signedTerm` (PDF/JPG/PNG). | 201 `{ patientId, accountState, consentEventId, signedFileId }`; se adulto com contato, envia link para definir senha; menor exige responsável e parentesco. `FileStorage` valida/cifra o termo e `ConsentEvent` o referencia; falha de banco descarta o upload, falha de arquivo aborta o cadastro. | 400/409, 403 fora da recepção/admin; 422 sem termo assinado válido; não expor conteúdo clínico. | RF-001/004, Q-05 |
| `POST /v1/patients/{id}/onsite-consents` | Recepção: `multipart/form-data` com `data` JSON `{ versionId, consentingPersonName, consentingRelationship?, guardianUserId?, accepted: true }` e `signedTerm` obrigatório. | 201 `{ consentEventId, signedFileId, state }`; registra novo aceite presencial para paciente já cadastrado, sem alterar versão anterior. | 403 fora da recepção/admin; 404 sujeito inexistente; 409 versão não vigente; 422 arquivo inválido. | RF-004, Q-05 |
| `GET /v1/me/dependents` | Sessão do responsável | 200 `{ items: [{ patientId, fullName, relationship, status }] }`. | 401/403; só vínculos ativos. | Q-05 |
| `GET /v1/consent-documents/current?kind=data` | Sessão ou cadastro | 200 `{ id, version, body, effectiveAt }`. | 404 se não publicado; cadastro fica indisponível. | RF-004 |
| `POST /v1/admin/consent-documents` | `{ kind: "data", version, bodyReference, effectiveAt }` | 201 versão imutável. | 403 sem admin; publicação por admin aprovada em P-12 e auditada. | RF-004 |
| `GET /v1/me/consents` | Sessão do paciente/responsável | 200 histórico por paciente autorizado, com versão, ato, data, origem. | 404 para dependente não vinculado. | RF-004 |
| `POST /v1/me/consents` | `{ patientId, versionId, action: "accept"|"refuse" }` | 201 `{ consentEventId, state }`; preserva histórico. | 409 versão não vigente; 403 sujeito alheio. | RF-004 |
| `POST /v1/me/consents/revoke` | `{ patientId, versionId, reason? }` | 201 `{ consentEventId, portalState: "restricted" }`; bloqueios imediatos. | 403 sujeito alheio; retenção legal preservada. | RF-004, Q-09 |

Versão publicada após aceite anterior exige novo aceite no próximo acesso antes de operações digitais dependentes. Nos dois endpoints multipart de cadastro/aceite presencial, enviar a parte `data` antes de `signedTerm` para permitir validação e cifragem em streaming; a ordem é detalhe técnico do contrato HTTP. Documento presencial assinado é `FileObject` com autorização restrita e auditoria. A regra jurídica definitiva pós-revogação é P-01.

## M0 — administração, direitos do titular, notificações e arquivos

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `POST /v1/admin/users` | `{ email, fullName, role }` | 201 `{ userId, status: "invited", invitationExpiresAt }`; e-mail de convite. | 403: gestor só recepção/profissional; admin pode gestor/recepção/profissional; 409 conta existente. | RF-029, Q-05 |
| `POST /v1/admin/users/{id}/invitation` | Sessão de admin/gestor autorizado ao papel do alvo | 201 `{userId,status,invitationExpiresAt}`; invalida convite anterior. | 409 alvo já ativo/inativo; 403 acima do ator. | RF-029, BE-007 |
| `GET /v1/admin/users` | Filtros `role,status,cursor` | 200 `{items,nextCursor,dpoDesignated}` com metadados, `lastLoginAt`, `reviewRequiredAt`; gestor só recepção/profissional; sem dados clínicos. | 403; paginação. | RF-029 |
| `PATCH /v1/admin/users/{id}/status` | `{ status: "active"|"inactive" }` | 200 novo status; desativar revoga sessões. | 409 último admin ou ativação antes de definir senha por convite; 403 fora do perfil; nunca DELETE. | RF-029 |
| `PUT /v1/admin/users/{id}/roles` | `{ roles: [...] }` | 200 papéis vigentes imediatamente e auditados. | 409 último admin; 403 concessão acima do ator. | RF-029 |
| `PUT /v1/admin/users/{id}/permissions/privacy.dpo` | `{ enabled: boolean }` | 200 `{userId,status,roles,dpoDesignated}`; auditoria e alerta quando `dpoDesignated=false`. | 403 só admin; 400 se alvo sem papel interno aceito. | Q-20, RF-032 |
| `POST /v1/me/subject-requests` | `{ patientId, kind: "access"|"correction"|"export"|"erasure", description? }` | 201 `{ requestId, status, dueAt }`. | 403 sujeito alheio; 400 tipo inválido. | RF-005, RNF-016 |
| `GET /v1/me/subject-requests` | Sessão e cursor | 200 coleção dos próprios pedidos/dependentes. | 403/404 fora do escopo. | RF-005 |
| `GET /v1/privacy/subject-requests` | `privacy.dpo`; admin somente se não houver DPO designado, filtros de status/prazo | 200 fila sem conteúdo clínico. | 403 fora dessas condições. | Q-20 |
| `GET /v1/privacy/consents` | `privacy.dpo`, filtros `patientId,action,from,to,cursor` | 200 coleção de metadados de versão, ato, ator, data e origem; sem anexo ou conteúdo clínico. | 403 sem `privacy.dpo`, inclusive admin sem grant; consulta auditada. | Q-20, RF-004 |
| `POST /v1/privacy/subject-requests/{id}/resolve` | `{ decision: "approved"|"denied"|"retained"|"referred", explanation }` | 200 `{requestId,status,resolution:{decision,explanation,deleted,preserved},exportReady}` auditado; para `access`/`export` aprovados o pacote M0 é gerado no servidor; para `correction`, apenas `referred`/`denied` sem alegar alteração; para `erasure`, apenas `retained` enquanto P-01 não for validado. | 403 sem `privacy.dpo` ou admin de fallback; 409 decisão incompatível ou pedido concluído. | RF-005, RNF-016 |
| `GET /v1/me/subject-requests/{id}/export` | Sessão do solicitante e vínculo próprio/dependente ativo | 200 JSON estruturado, com download auditado; conteúdo cifrado em repouso. Exportação M0 cobre cadastro e consentimentos, ampliada pelos módulos futuros. | 403/404 fora do escopo ou pacote indisponível. | RF-005 |
| `GET /v1/me/notifications` | Sessão/cursor | 200 categoria, canal, horário, status e texto mínimo seguro. | 403 sujeito alheio. | RF-013, Q-18 |
| `GET /v1/me/notification-preferences` | Sessão | 200 `{ channels, nonEssentialOptOut }` do próprio usuário. | 401/403. | Q-18, BE-006 |
| `GET /v1/notifications/attention` | Recepção/gestor/admin, cursor | 200 `{items:[{id,userId,patientId,deliveryStatus,failureReasonSafe,createdAt}],nextCursor}`; alertas de falha/canal externo ausente, sem conteúdo. | 403 demais perfis. | Q-18, BE-006 |
| `PUT /v1/me/notification-preferences` | `{ channels: ["email","portal"], nonEssentialOptOut: boolean }` | 200 preferência; essenciais não podem ser desligadas por categoria. | 400 canal indisponível; após revogação nenhum envio não legal. | Q-18 |
| `POST /v1/files` | Multipart com categoria/escopo autorizado | 201 `{ fileId, detectedType, size, scanStatus }`. | 400/422 tipo/tamanho/quantidade; 403 escopo; `skipped_dev` só fora de produção. | Q-17, RNF-014 |
| `POST /v1/files/{id}/download-link` | Sessão | 200 `{ url, expiresAt }`, TTL `file.signed_url_ttl_seconds`. | 404/403 não autorizado; auditoria de emissão do link. | Q-17 |
| `GET /v1/file-download/{signedToken}` | Sessão + token ainda válido | 200 stream; `Content-Disposition` seguro; auditar cada download. | 401/403/410 expirado ou revogado. | Q-17 |

Nenhuma rota administrativa dá acesso a prontuário. A consulta de consentimentos para DPO é parte de BE-012; a tela de revisão conjunta é FE-038 em M4. A política de autorização está em `access-policy.md`.

## Eventos internos M0

O formato proposto é `{ eventId, type, occurredAt, actorId?, subjectId?, aggregateId, correlationId, payloadSafe }`. Entrega pelo dispatcher tem chave idempotente `(type, aggregateId, versão)`; falha registra status/retry sem duplicar lembrete. Tipos iniciais: `account.invited`, `auth.login_succeeded`, `auth.login_failed`, `auth.password_reset`, `contact.verification_requested`, `consent.accepted`, `consent.revoked`, `subject_request.opened`, `notification.failed`. Payloads não contêm dados clínicos; e-mail/portal recebem template com dados mínimos autorizados. A infraestrutura de jobs pode usar Redis disponível, mas a escolha concreta fica em BE-006 e é documentada em `backend/architecture.md`.

## M1

### Catálogo, grade e disponibilidade

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

### Consultas, espera e operação do dia

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

### CSV demonstrativo

Layouts CSV, colunas e idempotência são definidos **somente** em `shared/import-templates.md`. As rotas não criam conta, consentimento ou notificação por importação e exigem admin/gestor. `migration.cutoff_date` permanece pendente para dados reais; demonstração usa dados fictícios.

| Método e rota | Requisição essencial | Sucesso | Erros / acesso |
| --- | --- | --- | --- |
| `POST /v1/imports/{patients|appointments}/preview` | CSV multipart + `sourceSystem` | 200 `{ batchId,fileHash,rows:[{line,status,errors,duplicateOf?}],accepted,rejected }`; nenhuma entidade de negócio gravada | 400 layout/encoding; relatório sem gravar linha de negócio; 403 fora admin/gestor. |
| `POST /v1/imports/{patients|appointments}/{batchId}/confirm` | `{ expectedFileHash }` + idempotency | 200 `{ batchId,imported,rejected,rows:[{line,status,targetId?,errors}] }` | 409 lote alterado/colisão, linha rejeitada com motivo; reimportação não duplica. |
| `GET /v1/imports/{batchId}` | ID do lote | 200 preview/relatório final, origem/importador/data e status | 403 fora admin/gestor; 404 lote alheio/inexistente. |

Importação de agenda usa a mesma barreira BE-020; horário histórico importado não vira evolução assinada. Eventos internos M1: `appointment.confirmed/rescheduled/cancelled/checked_in/no_show`, `waitlist.offer_created/expired/accepted`, `reminder.scheduled/sent/failed`, `import.previewed/confirmed`. Payloads seguem o envelope seguro de M0 e a chave idempotente por agregado/versão; nenhum evento revela conteúdo clínico.

## M2

### Vínculo, urgência e leitura clínica

Toda rota `/v1/clinical/*` exige papel profissional, vínculo `CareLink` vigente para o paciente ou `EmergencyAccessGrant` vigente, **exceto** leitura de evolução de autoria própria explicitada abaixo e atos administrativos de concessão sem conteúdo. `authorizationBasis`/ID do vínculo ou grant entra em `AuditEvent` de **cada leitura**. Sem vínculo, retornar 404 `NOT_FOUND_OR_FORBIDDEN` para não confirmar existência do prontuário. As janelas `access.link_pre_hours`, `access.link_post_days`, `access.link_noshow_days` e compartilhamento `access.shared_case_enabled` aguardam P-06; não habilitar esta política com valores implícitos. Entre especialidades, somente campos aprovados em P-06 podem ser projetados.

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `GET /v1/clinical/care-links/me` | `patientId?,status?,cursor` | 200 `{ items:[{id,patientId,source,startsAt,endsAt,status}],nextCursor }` | Profissional vê só vínculos próprios; sem prontuário no payload. | Q-21 |
| `POST /v1/clinical/care-links/share` | `{ patientId,targetProfessionalId,reason,endsAt }` | 201 vínculo individual temporário | 403 sem vínculo responsável/`access.shared_case_enabled`; 400 motivo/prazo inválido; auditoria. | Q-21 |
| `POST /v1/admin/care-links/substitution` | `{ patientId,targetProfessionalId,reason,startsAt,endsAt }` | 201 vínculo de cobertura temporária | 403 só gestor autorizado; concessão não dá leitura clínica ao gestor. | Q-21 |
| `POST /v1/clinical/emergency-access` | `{ patientId,justification }` | 201 `{ grantId,expiresAt }` por `emergency_access.duration_minutes` | 400 sem justificativa; 403 não profissional; aviso admin/DPO e auditoria reforçada. | RF-023 |
| `GET /v1/clinical/emergency-access/{id}` | ID grant | 200 estado/expiração/revisão, sem conteúdo clínico | Só autor e revisão autorizada; expiração automática. | RF-023 |
| `POST /v1/admin/emergency-access/{id}/review` | `{ outcome,notes }` | 200 revisão auditada | Admin/DPO vê metadados; nunca evolução. | RF-023 |
| `GET /v1/clinical/records/{patientId}` | Paciente da agenda/fila | 200 `{ recordNumber,patient:{id,name,birthDate},lastEncounterAt,alerts:[...],linkBasis:{id,expiresAt},firstVisit }` | 404 sem vínculo/urgência; acesso auditado. | RF-016/018 |
| `GET /v1/clinical/records/{patientId}/timeline` | `from?,to?,specialtyId?,type?,cursor` | 200 `{ items:[{id,type,date,specialty,professional,modality,summary,importedOrigin?}],nextCursor }`, campos filtrados por política entre especialidades | 404 sem vínculo/urgência; paginação e auditoria por página. | RF-016/022 |
| `GET /v1/clinical/evolutions/mine` | `patientId,cursor` | 200 somente IDs/resumos de evoluções finalizadas de autoria própria | Não abre outros registros após vínculo expirar. | Q-21 |
| `GET /v1/clinical/evolutions/{id}` | ID evolução | 200 conteúdo próprio ou autorizado por vínculo/urgência, com adendos juntos | 404 sem base; auditar. | RF-017, RN-008 |

`ClinicalEncounter` é aberto por atendimento confirmado/em andamento; consulta remota/presencial conserva mesmo modelo. O acesso pré-atendimento é leitura limitada, durante permite registrar evolução, após permite leitura temporal; autoria própria permanece apenas para evoluções próprias. Cancelamento/no-show alteram janela conforme Q-21. Conteúdo clínico nunca é retornado ao admin/gestor/recepção por estas rotas.

### Terminologias, evolução e alertas

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `GET /v1/terminologies/cid10` | `q,cursor` | 200 `{ items:[{code,description,version}],nextCursor }` tabela local | Somente profissional autorizado a registrar; busca não consulta serviço externo. | Q-08, RF-017 |
| `GET /v1/terminologies/tuss` | `q,cursor` | 200 códigos/descrições/version local | Opcional em atendimento particular; não gera guia TISS. | Q-08, RF-020 |
| `GET /v1/terminologies/medications` | `q,cursor` | 200 nome/princípio ativo/fonte/versão da tabela local | Fonte/versão e controlados pendem P-13; sem prescrição clínica válida até definição. | RF-019 |
| `POST /v1/clinical/encounters/{id}/evolutions/draft` | `{ complaint,history,physicalExam,diagnosticHypotheses,conduct,diagnosisCodes }` | 201 `{ evolutionId,draftVersion,savedAt,status:"draft" }` | 403 fora autor/atendimento; 400 CID inválido. | RF-017 |
| `PATCH /v1/clinical/evolutions/{id}/draft` | Mesmo payload parcial + `{ expectedDraftVersion }` | 200 `{ draftVersion,savedAt,status:"draft" }` | 409 versão concorrente/finalizada; autosave RNF-008. | RF-017 |
| `POST /v1/clinical/evolutions/{id}/finalize` | `{ expectedDraftVersion }` | 200 `{ status:"finalized",finalizedAt,contentHash }` | 409 versão antiga/já final; campos obrigatórios ausentes 400. | RF-017/RN-008 |
| `POST /v1/clinical/evolutions/{id}/addenda` | `{ reason,correctionText }` | 201 `{ addendumId,originalEvolutionId,createdAt }` | 403 se não autor; 400 sem justificativa; original intocado. | RF-017/RN-008 |
| `GET /v1/clinical/records/{patientId}/alerts` | Paciente autorizado | 200 `{ items:[{id,kind,term,verificationState,active,author,date}],history? }` | 404 sem vínculo/urgência; auditar. | RF-018 |
| `POST /v1/clinical/records/{patientId}/alerts` | `{ kind,term,substanceCode?,verificationState }` | 201 alerta/evento | 403 sem vínculo em atendimento; 400 campo inválido. | RF-018 |
| `POST /v1/clinical/alerts/{id}/deactivate` | `{ reason }` | 200 `active:false`, histórico preservado | 400 sem razão; 403 sem vínculo; nunca DELETE. | RF-018 |

Rascunho salva no servidor e é recuperado após sessão expirar; FE-022 dispara salvamento em até 30 s, indica `Salvando…/Salvo/Erro` e não descarta texto não sincronizado. Finalização exige autoria, data e hash imutáveis. Q-04 substitui edição direta de 24 h: **qualquer correção de finalizada é adendo**. Alerta relatado pelo paciente continua marcado `reported` até confirmação clínica.

### Documentos, prescrição, exames e projeção do paciente

`ClinicalDocumentPayload` é discriminado por `typeCode`: `prescription` usa `items:[{ medicationCode?,name,activeSubstance?,dose,route,frequency,quantity,instructions }]`; `exam_order` usa `exams:[{ tussCode?,description,indication }]`; `certificate/declaration/report/referral` usa `{ templateVersion,body,period? }` sem estrutura clínica inventada além do modelo aprovado. Campos e versões ficam congelados em `ClinicalDocument`. Catálogo `DocumentType.requiredSignatureLevel` decide o nível. Em desenvolvimento, `DevSignatureProvider` gera hash SHA-256, signatário, data/hora, versão e selo **sem validade jurídica**; `issued_dev` não equivale a `issued_valid`. Em produção, provider dev é bloqueado e emissão válida exige provider real apropriado P-02. Código público de verificação retorna metadados de integridade, nunca conteúdo clínico.

| Método e rota | Requisição essencial | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `GET /v1/document-types` | `active?` | 200 tipos/nível exigido/versão do modelo | Leitura por profissional; edição do catálogo é decisão P-02. | Q-10 |
| `PUT /v1/admin/document-types/{id}` | `{ requiredSignatureLevel,templateVersion,active,reason }` | 200 versão nova do tipo, mudança auditada; documentos antigos mantêm nível/versão congelados | 403 sem admin autorizado; publicação clínica depende da validação P-02. | Q-10 |
| `POST /v1/clinical/encounters/{id}/documents/drafts` | `{ typeCode,payload:ClinicalDocumentPayload }` | 201 `{ documentId,status:"draft",requiredSignatureLevel }` | 400 payload/tipo, 403 sem atendimento. | RF-019–021 |
| `PATCH /v1/clinical/documents/{id}/draft` | `{ payload,expectedVersion }` | 200 draft atualizado | 409 já emitido/versão antiga. | RF-019–021 |
| `POST /v1/clinical/documents/{id}/issue` | `{ acknowledgedAllergyIds?:[],expectedVersion }` | 200 `{ status:"issued_dev"|"issued_valid",verificationCode,signature:{level,provider,signedAt,sha256,legalValidity} }` | 409 alergia não reconhecida/versão; 503 provider exigido indisponível; produção jamais aceita dev. | RF-019–021, RN-009 |
| `POST /v1/clinical/documents/{id}/void` | `{ reason,replacementDocumentId? }` | 200 `status:"voided"` com trilha; conteúdo anterior preservado | 400 sem razão; 403 fora autor autorizado. | RF-019/021 |
| `GET /v1/documents/verify/{code}` | Código opaco | 200 `{ documentId,type,issuedAt,issuer,sha256,status,signatureLevel,legalValidity }` sem conteúdo do paciente | 404 código inválido; rate limit técnico e auditoria. | RF-019/021 |
| `GET /v1/clinical/documents/{id}` | ID documento | 200 metadados/conteúdo autorizado, adendos/anulações se houver | Profissional com vínculo/autoria; paciente só via projeção abaixo. | RF-019–021 |
| `POST /v1/clinical/exam-results` | Multipart `data:{ patientId,orderId?,origin:"ordered"|"external" }` + `resultFile` | 201 `{ resultId,fileId,orderId?,origin }`; notifica profissional solicitante se houver | 422 formato/tamanho; recepção faz upload cego e não lê depois; paciente só próprio/dependente. | RF-020 |
| `GET /v1/clinical/exam-orders/pending` | `professionalId?,cursor` | 200 pedidos sem resultado além de `exam.pending_result_alert_days` | Só solicitante próprio, com acesso autorizado. | RF-020 |
| `POST /v1/clinical/publications` | `{ patientId,resourceType,resourceId,visibilityKind }` | 201 publicação explícita auditada | 400 rascunho/hipótese/interno; 403 sem vínculo/autoria; não publica automático. | RF-022, Q-03 |
| `GET /v1/me/clinical-history` | `patientId,from?,to?,specialtyId?,type?,cursor` | 200 `{ items:[{id,type,date,specialty,professional,modality,summary?,publishedDocument?,importedOrigin?}],nextCursor }` **somente publicado** | 403/404 fora próprio/dependente; sem anamnese/evolução integral/nota interna. | RF-022, Q-03 |
| `GET /v1/me/clinical-documents/{id}` | ID publicado | 200 metadados + link de download autenticado; selo dev se aplicável | 404 não publicado/outro sujeito; auditoria de leitura/download. | RF-022 |

`ExamResult` sem pedido aparece como origem externa identificada no histórico. Recepção/paciente podem anexar, mas recepção não ganha leitura posterior do conteúdo. Resultado excedente/formato falso é recusado pelo FileStorage de BE-013. Pedido pendente avisa via chave `exam.pending_result_alert_days`; documento clínico assinado é imutável. Prescrição de controlados e fonte de medicamentos dependem P-13; não inferir conformidade regulatória. Paciente vê apenas publicação Q-03, e solicitação formal RF-005 continua via M0.

### Histórico importado manual

`POST /v1/clinical/records/{patientId}/imported-history` receberá `{ originalDate?,origin,originalAuthor?,contentReference?,fileId? }` e retornará 201 com origem/importador/data **somente após decisão P-11 sobre o papel que pode enviar conteúdo**. `POST /v1/clinical/imported-history/{id}/check` por profissional vinculado registra `checkedBy/checkedAt`. `POST /v1/clinical/imported-history/{id}/addenda` registra correção justificada, sem UPDATE do original. `GET /v1/clinical/imported-history/{id}` exige vínculo/urgência e inclui origem/adendos. Nenhuma dessas rotas transforma item importado em evolução assinada; nenhum admin/gestor recebe leitura clínica por inferência do direito de importar.

## M3 — teleconsulta

Todos os comandos exigem sessão autenticada, consulta online confirmada e titular/responsável ou profissional vinculado. Consentimento de dados ativo é pré-condição; termo de teleconsulta e consentimento de gravação são independentes. Erros seguem envelope geral. `403` nega ator/consentimento, `409` nega estado conflitante ou termo antigo, `422` arquivo inválido, `410` sessão ou mídia revogada/expirada. Nunca retornar SDP/ICE em REST persistido.

| Método e rota | Requisição | Sucesso | Regra / origem |
| --- | --- | --- | --- |
| `GET /v1/teleconsultations/{appointmentId}/terms` | ID de consulta | 200 `{teleconsultTerm:{version,text},recordingTerm:{version,text},teleconsultConsentStatus,recordingConsentStatus}` | RF-024/027; termo vigente no servidor. |
| `POST /v1/teleconsultations/{appointmentId}/consent` | `{termVersion,accepted:boolean,guardianLinkId?}` | 201 evento de aceite/recusa com autor/data | Recusa oferece agendamento presencial via M1, sem iniciar sessão. |
| `POST /v1/teleconsultations/{appointmentId}/sessions` | `{clientCapabilities:{camera,microphone,downloadMbps,uploadMbps,testedAt}}` | 201 `{sessionId,status,wsTicket,expiresAt}` | Consentimento vigente e teste RNF-025; profissional/paciente da consulta. Ticket curto, uso único, vinculado à sessão. |
| `GET /v1/teleconsultations/{appointmentId}/sessions/{id}` | IDs | 200 `{status,participants,startedAt,connectionState,reconnectUntil?}` | Estado sem conteúdo de mídia. |
| `POST /v1/teleconsultations/{appointmentId}/sessions/{id}/end` | `{reason}` | 200 `{status:"ended",endedAt}` | Idempotente, auditoria; expiração/revogação também encerram. |
| `POST /v1/teleconsultations/{appointmentId}/sessions/{id}/files` | Multipart `data:{visibility}` + `file` | 201 `{sharedFileId,fileId,uploadedBy,sharedAt}` | BE-013 valida tipo/tamanho/conteúdo; acesso somente participantes, download auditado. |
| `GET /v1/teleconsultations/{appointmentId}/sessions/{id}/files` | IDs | 200 lista autorizada com metadados, sem URL pública persistente | `403` fora sessão; arquivo revogado omitido. |
| `POST /v1/teleconsultations/{appointmentId}/sessions/{id}/files/{sharedFileId}/attach-to-record` | `{ patientId,encounterId,reason }` | 201 vínculo imutável com arquivo, origem da sessão e autor | Só profissional da consulta com vínculo clínico; incorporação explícita, auditoria e retenção RN-012. |
| `POST /v1/teleconsultations/{appointmentId}/sessions/{id}/recording-consent` | `{termVersion,accepted:boolean,guardianLinkId?}` | 201 `{eventId,status,at}` | Consentimento de gravação específico antes de MediaRecorder. |
| `POST /v1/teleconsultations/{appointmentId}/sessions/{id}/recordings` | Multipart WebM + `{consentEventId,startedAt,stoppedAt,sha256}` | 201 `{recordingId,status:"stopped",retentionUntil}` | Só cliente do profissional que atendeu; limites `file.recording_max_mb`/`file.recording_max_minutes`; upload iniciado apenas após aceite. |
| `POST /v1/teleconsultations/{appointmentId}/sessions/{id}/recordings/revoke` | `{reason?}` | 200 `{status:"revoked",revokedAt,deletionJobId}` | Consentimento revogado interrompe cliente imediatamente; todas as gravações/derivados inacessíveis, expurgo P-03. |
| `GET /v1/teleconsultations/{appointmentId}/sessions/{id}/recordings` | IDs | 200 metadados e acesso autenticado do profissional que atendeu | `410` após revogação/retensão; paciente sem acesso V1 até P-09. |

WebSocket `/v1/teleconsultations/signal?ticket=...`: autenticação por ticket de uso único e verificação de sessão/consulta em cada conexão; eventos `join`, `offer`, `answer`, `ice-candidate`, `connection-state`, `leave`, `error` têm `{sessionId,participantId,seq,at,payload}`. Servidor aceita `offer/answer/ice-candidate` apenas de participante autenticado e envia só ao outro participante da mesma sessão; ordena `seq`, limita tamanho/taxa e não registra payload SDP/ICE em logs. Reconexão deve restaurar sinalização por até limite RNF-008; se sessão terminou, retornar erro de estado e exigir nova autorização. Nenhum pacote de mídia passa pelo WebSocket. MediaRecorder roda no cliente, e o servidor só armazena arquivo cifrado em `RecordingStorage`; não transcreve/processa mídia. DTLS-SRTP protege trânsito, mas RNF-014 segue parcial P-04.

## M4 — indicadores, relatórios e auditoria consultável

Indicadores são agregados e nunca retornam nomes/CPF, dados clínicos ou listas de pacientes. Filtros `from,to,specialtyId?,professionalId?` são combinados sob permissão de gestor/admin. Para evitar reidentificação, se um agrupamento tiver menos sujeitos que `report.aggregation_min_subjects` (P-14), retornar `{ suppressed:true, value:null, denominator:null }` sem contagem exata; suprimir também totais e complementos que permitam reconstruir a célula por subtração. Enquanto não houver valor aprovado, suprimir qualquer célula que possa ser pequena. Fórmulas técnicas propostas: ocupação = reservas confirmadas/horários publicados elegíveis; absenteísmo = faltas confirmadas/consultas marcadas concluídas ou faltosas; proporção modalidade = atendimentos realizados por modalidade/total realizado; produtividade = atendimentos realizados por profissional/período. Excluir cancelamentos do denominador de absenteísmo; validar fórmulas P-14 antes de produção. Divisão por zero retorna `null` com `insufficient_data`, nunca 0 enganoso.

| Método e rota | Requisição | Sucesso | Erros / acesso | Origem |
| --- | --- | --- | --- | --- |
| `GET /v1/management/indicators` | `from,to,specialtyId?,professionalId?` | 200 `{ period,filters,occupancy,absence,visitsBySpecialty,visitsByModality,productivity,generatedAt }`; cada métrica `{value,denominator,suppressed,insufficientData}` | 403 fora gestor/admin; limites de filtro e supressão P-14. | RF-030 |
| `GET /v1/management/reports/types` | Sessão | 200 tipos operacionais permitidos, filtros e `containsPersonalData` | 403; sem conteúdo clínico por papel. | RF-031 |
| `POST /v1/management/reports` | `{type,filters,format:"csv",acknowledgePersonalData?:boolean}` | 200 `{mode:"sync",preview,downloadToken,rowCount}` ou 202 `{mode:"async",jobId,status:"queued"}` | 400 filtros; 403 escopo; 409 sem ciência para dados pessoais; usar `report.sync_max_rows` e `report.sync_timeout_seconds`. | RF-031 |
| `GET /v1/management/reports/{jobId}` | ID | 200 `{status:"queued"|"running"|"ready"|"failed",rowCount?,downloadToken?,errorCode?}` | 404 outro solicitante; download autenticado/auditado. | RF-031 |
| `GET /v1/admin/audit-events` | `from,to,actorId?,patientId?,eventType?,cursor` | 200 lista cronológica `{id,occurredAt,actor,action,resource,origin,requestId,urgency,permissionChange}` + cursor | Admin ou `privacy.dpo`; consulta auditada, payload clínico omitido. | RF-032 |
| `POST /v1/admin/audit-exports` | `{from,to,actorId?,patientId?,eventType?,reason}` | 202 `{jobId,status}`; arquivo exportado usa download autenticado/auditado | 403 sem permissão, 400 sem motivo; exportação também gera AuditEvent. | RF-032 |
| `GET /v1/admin/audit-exports/{jobId}` | ID | 200 status/token curto se pronto | 404 outro solicitante; sem UPDATE/DELETE dos eventos. | RF-032 |

CSV UTF-8 é proposta técnica P-14; delimitador/cabeçalho são fixados em contrato de relatório versionado. Campos pessoais são minimizados, e cada emissão registra ator, filtros, escopo, formato, quantidade e ciência. O job usa outbox/worker de `backend/architecture.md`, notifica quando pronto via canais ativos Q-18 e produz token de download de `file.signed_url_ttl_seconds`. Timeout síncrono converte a operação em job sem duplicar relatório. AuditEvent nunca armazena arquivo nem conteúdo clínico; a própria consulta/exportação gera evento em trilha append-only, sem recursão infinita de auditoria.

### Política HTTP de sessão M0 aprovada (P-12)

Login, enrollment e verify retornam `Cache-Control: no-store`. `vp_refresh` é cookie HttpOnly, host-only, Secure em staging/produção, SameSite=Lax, Path=/v1/auth. `vp_csrf` é host-only, Secure, SameSite=Lax, Path=/, legível pelo front. Refresh/logout exigem `X-CSRF-Token` igual ao cookie e ao hash ligado à sessão, além de `Origin` permitido. Rotação troca ambos; refresh em paralelo deve ser serializado pelo cliente. Toda mutação de autenticação exige Origin da allowlist; desenvolvimento HTTP localhost admite Secure=false. Access token não contém dados pessoais/papéis; autorização recarrega estado atual do banco.
