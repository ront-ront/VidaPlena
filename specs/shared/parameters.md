# Parâmetros compartilhados

**Regra:** esta é a fonte única de chaves, defaults, dono, origem e estado. Specs e seus critérios de aceite citam a **chave**; testes usam default aprovado/provisório. `—` significa **sem valor decidido**: a spec dependente pode ser redigida, mas não declarada pronta para implementar. Valores mínimos legais do DRS não podem ser reduzidos por configuração.

## Identidade e privacidade

| Chave | Default | Origem | Dono / estado |
| --- | --- | --- | --- |
| `auth.password_min_length` | 10 | Q-15, RF-001/003 | Equipe técnica; decidido, configurável |
| `auth.password_common_list_enabled` | true | Q-15 | Equipe técnica; decidido |
| `auth.password_hash` | bcrypt | Q-15, RNF-013 | Equipe técnica; decidido |
| `auth.password_history_count` | — | RF-003 (“últimas utilizadas”) | Clínica/segurança; pendente P-05 |
| `auth.access_token_minutes` | 15 | Q-15 | Equipe técnica; decidido |
| `auth.refresh_token_days` | 7 | Q-15 | Equipe técnica; decidido, rotação obrigatória |
| `auth.internal_idle_minutes` | 30 | Q-15 | Clínica/segurança; decidido, desvio RNF-013 (15 min no DRS) |
| `auth.patient_idle_minutes` | 60 | Q-15 | Clínica/segurança; decidido |
| `auth.reset_link_minutes` | 30 | Q-15 | Equipe técnica; decidido, uso único |
| `auth.invite_link_hours` | 48 | Q-15 | Equipe técnica; decidido |
| `auth.email_verify_link_hours` | 48 | Q-15 | Equipe técnica; decidido |
| `auth.reset_requests_per_hour` | 3 | Q-15 | Equipe técnica; decidido |
| `auth.failed_login_limit` | 5 | RF-002, RNF-013 | Clínica/segurança; decidido |
| `auth.lock_minutes` | — | RF-002 | Clínica/segurança; pendente P-05 |
| `auth.mfa_method` | — | RF-002, RNF-013 | Clínica/segurança; pendente P-05 |
| `privacy.clinical_retention_years` | 20 mínimo | RN-012, RNF-017 | Jurídico/DPO; mínimo obrigatório |
| `privacy.audit_retention_years` | 5 mínimo | RNF-015 | Jurídico/DPO; mínimo obrigatório |
| `privacy.min_identity_retention_years` | — | Q-09 | Jurídico/DPO; pendente P-01, sujeito à base legal |
| `privacy.consent_evidence_retention_years` | — | Q-09 | Jurídico/DPO; pendente P-01, sujeito à base legal |
| `privacy.fiscal_retention_years` | — | Q-09 | Jurídico/DPO; pendente P-01, sujeito à base legal |
| `privacy.subject_request_days` | 15 | RNF-016 | Jurídico/DPO; fonte DRS |

## Agenda e operação

Todos os defaults deste quadro foram autorizados como **provisórios e aguardando decisão** em Q-16; não são políticas finais da clínica.

| Chave | Default provisório | Origem | Quem decide / observação |
| --- | --- | --- | --- |
| `waitlist.offer_ttl_minutes` | 30 | RF-012 | Clínica/gestor; oferta passa ao próximo |
| `reminder.schedule_hours_before` | `[24, 2]` | RF-013, RN-005 | Clínica/gestor; no máximo 2 envios; 2 h adição Q-16 |
| `appointment.late_tolerance_minutes` | 15 | RF-014 | Clínica/gestor |
| `appointment.noshow_after_minutes` | 30 | RF-015 | Clínica/gestor; confirmação manual V1 |
| `exam.pending_result_alert_days` | 7 | RF-020 | Clínica/responsável técnico |
| `emergency_access.duration_minutes` | 60 | RF-023 | Clínica/jurídico; justificativa/auditoria não configuráveis |
| `account.inactivity_review_days` | 90 | RF-029 | Admin/gestor; revisão, nunca exclusão automática |
| `report.sync_max_rows` | 5000 | RF-031 | Equipe técnica; excedente assíncrono |
| `report.sync_timeout_seconds` | 10 | RF-031 | Equipe técnica; timeout assíncrono |
| `migration.cutoff_date` | — | Q-19 | Clínica/gestor; pendente P-07 |

## Arquivos, gravação e acesso clínico

| Chave | Default provisório | Origem | Dono / estado |
| --- | --- | --- | --- |
| `file.attachment_formats` | PDF, JPG, PNG | Q-17 | Equipe técnica; aguardando decisão |
| `file.result_formats` | PDF, JPG, PNG | Q-17 | Equipe técnica; aguardando decisão |
| `file.recording_formats` | WebM | Q-17 | Equipe técnica; aguardando decisão |
| `file.attachment_max_mb` | 10 | Q-17 | Equipe técnica; aguardando decisão |
| `file.result_max_mb` | 20 | Q-17 | Equipe técnica; aguardando decisão |
| `file.recording_max_mb` | 500 | Q-17 | Equipe técnica; aguardando decisão |
| `file.recording_max_minutes` | 60 | Q-17 | Equipe técnica; aguardando decisão |
| `file.max_per_record` | 10 | Q-17 | Equipe técnica; aguardando decisão |
| `file.signed_url_ttl_seconds` | 120 | Q-17 | Equipe técnica; aguardando decisão |
| `recording.retention_days` | 30 | Q-11 | Jurídico/clínica; provisório |
| `recording.delete_after_revocation_days` | — | Q-11 | Jurídico/responsável técnico; pendente P-03 |
| `backup.revoked_content_rotation_days` | — | Q-11 | Jurídico/operações; pendente P-03 |
| `access.link_pre_hours` | — | Q-21 | Clínica/responsável técnico; pendente P-06 |
| `access.link_post_days` | — | Q-21 | Clínica/responsável técnico; pendente P-06 |
| `access.link_noshow_days` | — | Q-21 | Clínica/responsável técnico; pendente P-06 |
| `access.shared_case_enabled` | — | Q-21 | Clínica/responsável técnico; pendente P-06 |

Validar MIME/assinatura real do arquivo, não apenas extensão; nomes internos aleatórios e autorização/auditoria por download são regras invariantes, não parâmetros. DevMalwareScanner registra `skipped_dev` e é bloqueado em produção. Paciente não acessa gravação na V1 até decisão P-09.

## Desempenho e disponibilidade

Metas Q-22 são provisórias e medidas no cenário versionado de `performance-scenario.md`. Limites não substituídos de RNF-009–011 continuam vigentes.

| Chave | Default | Origem / estado |
| --- | --- | --- |
| `perf.chart_p95_ms` | 2000 | Q-22; provisório |
| `perf.heavy_chart_p95_ms` | 4000 | Q-22; provisório, exceção documentada RNF-009 |
| `perf.patient_search_p95_ms` | 1000 | Q-22; provisório |
| `perf.availability_p95_ms` | 1500 | Q-22; provisório, exceção documentada RNF-009 |
| `perf.booking_p95_ms` | 1500 | Q-22; provisório |
| `perf.error_rate_percent_max` | 1 | Q-22; provisório |
| `perf.base_concurrent_users` | 50 | Q-22; provisório |
| `perf.peak_concurrent_users` | 150 | Q-22; provisório |
| `perf.growth_multiplier` | 3 | Q-22, RNF-010; provisório |
| `perf.growth_degradation_percent_max` | 20 | RNF-010; fonte DRS |
| `perf.internal_concurrent_users_min` | 60 | RNF-010; fonte DRS |
| `perf.video_concurrent_sessions_min` | 40 | RNF-010; fonte DRS |
| `ops.availability_percent_min` | 99.7 | RNF-006; fonte DRS |
| `ops.rpo_minutes_max` | 15 | RNF-007; fonte DRS |
| `ops.rto_hours_max` | 4 | RNF-007; fonte DRS |

`RNF-011` mantém vídeo 720p/30 fps a 1,5 Mbps, latência <300 ms e áudio prioritário; `RNF-025` mantém pré-teste com pelo menos 2 Mbps em cada sentido. A infraestrutura-alvo real e as metas definitivas precisam de confirmação P-07.
