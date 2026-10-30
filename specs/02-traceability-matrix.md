# Matriz de rastreabilidade — requisitos → specs

**Atualização:** lote M4 da Fase 3. **Escopo da matriz:** 32 RF, 25 RNF, 12 RN do DRS e 16 UI extraídos dos documentos de front. A tabela principal mede **documentação de spec**; implementação M0 autorizada posteriormente está registrada separadamente ao fim deste arquivo.

## Legenda

- **Total:** todas as specs planejadas para o requisito já foram redigidas neste lote. Isso não significa implementação concluída.
- **Parcial:** pelo menos uma spec foi redigida, mas outra depende de lote futuro.
- **Pendente:** nenhuma spec do requisito foi redigida ainda; o mapeamento do plano existe.
- **Limite de conformidade:** `RN-009`/`RNF-017` exigem assinatura ICP-Brasil real; `RNF-014` exige fim a fim; implementação dev/P2P é parcial mesmo após specs redigidas. RNF-006/007/024 dependem de evidência operacional. Ver `04-open-questions.md`.

## Cobertura

| Requisito | Origem | Spec(s) e milestone | Cobertura documental M4 |
| --- | --- | --- | --- |
| RF-001 | DRS §3.1.1, RF001 | BE-002 (M0 redigida), BE-010 (M0 redigida), FE-007 (M0 redigida), FE-039 (M0 redigida), BE-028 (M1 redigida), FE-019 (M1 redigida) | Total |
| RF-002 | DRS §3.1.2, RF002 | BE-008 (M0 redigida), FE-004 (M0 redigida), FE-005 (M0 redigida) | Total |
| RF-003 | DRS §3.1.3, RF003 | BE-009 (M0 redigida), FE-006 (M0 redigida) | Total |
| RF-004 | DRS §3.1.4, RF004 | BE-011 (M0 redigida), FE-007 (M0 redigida), FE-008 (M0 redigida), FE-039 (M0 redigida), FE-038 (M4 redigida) | Total |
| RF-005 | DRS §3.1.5, RF005 | BE-009 (M0 redigida), BE-012 (M0 redigida), FE-008 (M0 redigida), FE-038 (M4 redigida) | Total |
| RF-006 | DRS §3.2.1, RF006 | BE-019 (M1 redigida), FE-012 (M1 redigida), FE-015 (M1 redigida) | Total |
| RF-007 | DRS §3.2.2, RF007 | BE-017 (M1 redigida), BE-021 (M1 redigida), BE-029 (M1 redigida), FE-010 (M1 redigida), FE-013 (M1 redigida), FE-016 (M1 redigida), FE-020 (M1 redigida) | Total |
| RF-008 | DRS §3.2.3, RF008 | BE-017 (M1 redigida), BE-020 (M1 redigida), BE-029 (M1 redigida), FE-013 (M1 redigida), FE-020 (M1 redigida), BE-051 (M4 redigida) | Total |
| RF-009 | DRS §3.2.4, RF009 | BE-022 (M1 redigida), FE-014 (M1 redigida), FE-016 (M1 redigida) | Total |
| RF-010 | DRS §3.2.5, RF010 | BE-023 (M1 redigida), FE-014 (M1 redigida), FE-016 (M1 redigida) | Total |
| RF-011 | DRS §3.2.6, RF011 | BE-018 (M1 redigida), FE-011 (M1 redigida) | Total |
| RF-012 | DRS §3.2.7, RF012 | BE-024 (M1 redigida), FE-017 (M1 redigida) | Total |
| RF-013 | DRS §3.2.8, RF013 | BE-006 (M0 redigida), BE-025 (M1 redigida) | Total |
| RF-014 | DRS §3.2.9, RF014 | BE-026 (M1 redigida), FE-015 (M1 redigida), FE-018 (M1 redigida) | Total |
| RF-015 | DRS §3.2.10, RF015 | BE-027 (M1 redigida), FE-015 (M1 redigida), FE-018 (M1 redigida) | Total |
| RF-016 | DRS §3.3.1, RF016 | BE-028 (M1 redigida), BE-030 (M2 redigida), BE-032 (M2 redigida), BE-033 (M2 redigida), FE-021 (M2 redigida), FE-029 (M2 redigida) | Total |
| RF-017 | DRS §3.3.2, RF017 | BE-034 (M2 redigida), BE-035 (M2 redigida), BE-036 (M2 redigida), FE-022 (M2 redigida) | Total |
| RF-018 | DRS §3.3.3, RF018 | BE-037 (M2 redigida), FE-023 (M2 redigida) | Total |
| RF-019 | DRS §3.3.4, RF019 | BE-039 (M2 redigida), FE-024 (M2 redigida) | Total |
| RF-020 | DRS §3.3.5, RF020 | BE-013 (M0 redigida), BE-034 (M2 redigida), BE-040 (M2 redigida), BE-041 (M2 redigida), FE-025 (M2 redigida), FE-040 (M2 redigida) | Total |
| RF-021 | DRS §3.3.6, RF021 | BE-042 (M2 redigida), FE-026 (M2 redigida) | Total |
| RF-022 | DRS §3.3.7, RF022 | BE-032 (M2 redigida), BE-033 (M2 redigida), BE-043 (M2 redigida), FE-021 (M2 redigida), FE-027 (M2 redigida), FE-029 (M2 redigida) | Total |
| RF-023 | DRS §3.3.8, RF023 | BE-031 (M2 redigida), FE-028 (M2 redigida) | Total |
| RF-024 | DRS §3.4.1, RF024 | BE-044 (M3 redigida), FE-030 (M3 redigida) | Total |
| RF-025 | DRS §3.4.2, RF025 | BE-045 (M3 redigida), FE-030 (M3 redigida), FE-031 (M3 redigida), FE-032 (M3 redigida) | Total |
| RF-026 | DRS §3.4.3, RF026 | BE-013 (M0 redigida), BE-046 (M3 redigida), FE-033 (M3 redigida) | Total |
| RF-027 | DRS §3.4.4, RF027 | BE-013 (M0 redigida), BE-047 (M3 redigida), BE-053 (M3 redigida), BE-054 (M3 redigida), FE-034 (M3 redigida) | Total |
| RF-028 | DRS §3.5.1, RF028 | BE-016 (M1 redigida), FE-010 (M1 redigida) | Total |
| RF-029 | DRS §3.5.2, RF029 | BE-002 (M0 redigida), BE-005 (M0 redigida), BE-007 (M0 redigida), FE-006 (M0 redigida), FE-009 (M0 redigida) | Total |
| RF-030 | DRS §3.5.3, RF030 | BE-048 (M4 redigida), FE-035 (M4 redigida) | Total |
| RF-031 | DRS §3.5.4, RF031 | BE-049 (M4 redigida), FE-036 (M4 redigida) | Total |
| RF-032 | DRS §3.5.5, RF032 | BE-004 (M0 redigida), BE-050 (M4 redigida), FE-037 (M4 redigida), FE-038 (M4 redigida) | Total |
| RNF-001 | DRS §4.1.1, NF001 | FE-012 (M1 redigida), FE-013 (M1 redigida) | Total |
| RNF-002 | DRS §4.1.2, NF002 | FE-015 (M1 redigida), FE-016 (M1 redigida), FE-018 (M1 redigida) | Total |
| RNF-003 | DRS §4.1.3, NF003 | FE-002 (M0 redigida), FE-007 (M0 redigida), FE-027 (M2 redigida) | Total |
| RNF-004 | DRS §4.1.4, NF004 | FE-013 (M1 redigida), FE-015 (M1 redigida), FE-021 (M2 redigida) | Total |
| RNF-005 | DRS §4.2.1, NF005 | BE-033 (M2 redigida), BE-036 (M2 redigida), FE-029 (M2 redigida) | Total |
| RNF-006 | DRS §4.2.2, NF006 | BE-014 (M0 redigida), BE-015 (M0 redigida) | Total |
| RNF-007 | DRS §4.2.3, NF007 | BE-015 (M0 redigida) | Total |
| RNF-008 | DRS §4.2.4, NF008 | BE-035 (M2 redigida), FE-022 (M2 redigida), FE-031 (M3 redigida) | Total |
| RNF-009 | DRS §4.3.1, NF009 | BE-019 (M1 redigida), BE-032 (M2 redigida), BE-051 (M4 redigida) | Total |
| RNF-010 | DRS §4.3.2, NF010 | BE-020 (M1 redigida), BE-051 (M4 redigida), BE-052 (M4 redigida) | Total |
| RNF-011 | DRS §4.3.3, NF011 | BE-045 (M3 redigida), FE-032 (M3 redigida), BE-052 (M4 redigida) | Total |
| RNF-012 | DRS §4.4.1, NF012 | BE-002 (M0 redigida), BE-005 (M0 redigida), FE-004 (M0 redigida), FE-009 (M0 redigida), BE-030 (M2 redigida) | Total |
| RNF-013 | DRS §4.4.2, NF013 | BE-007 (M0 redigida), BE-008 (M0 redigida), BE-009 (M0 redigida), FE-004 (M0 redigida), FE-005 (M0 redigida) | Total |
| RNF-014 | DRS §4.4.3, NF014 | BE-013 (M0 redigida), BE-045 (M3 redigida), BE-053 (M3 redigida), BE-054 (M3 redigida), FE-033 (M3 redigida), BE-052 (M4 redigida) | Total |
| RNF-015 | DRS §4.4.4, NF015 | BE-004 (M0 redigida), BE-031 (M2 redigida), FE-028 (M2 redigida), BE-049 (M4 redigida), BE-050 (M4 redigida), FE-037 (M4 redigida) | Total |
| RNF-016 | DRS §4.4.5, NF016 | BE-010 (M0 redigida), BE-011 (M0 redigida), BE-012 (M0 redigida), FE-008 (M0 redigida), BE-028 (M1 redigida), BE-043 (M2 redigida), BE-048 (M4 redigida), FE-035 (M4 redigida), FE-038 (M4 redigida) | Total |
| RNF-017 | DRS §4.4.6, NF017 | BE-038 (M2 redigida), FE-041 (M2 redigida) | Total |
| RNF-018 | DRS §4.5.1, NF018 | FE-003 (M0 redigida), FE-031 (M3 redigida) | Total |
| RNF-019 | DRS §4.5.2, NF019 | FE-003 (M0 redigida), FE-007 (M0 redigida), FE-012 (M1 redigida), FE-027 (M2 redigida), FE-031 (M3 redigida) | Total |
| RNF-020 | DRS §4.6.1, NF020 | FE-001 (M0 redigida), FE-003 (M0 redigida) | Total |
| RNF-021 | DRS §4.6.2, NF021 | BE-003 (M0 redigida), FE-002 (M0 redigida), FE-013 (M1 redigida), FE-019 (M1 redigida), FE-020 (M1 redigida), FE-025 (M2 redigida), FE-040 (M2 redigida), FE-036 (M4 redigida) | Total |
| RNF-022 | DRS §4.6.3, NF022 | BE-034 (M2 redigida) | Total |
| RNF-023 | DRS §4.7.1, NF023 | FE-031 (M3 redigida), FE-032 (M3 redigida) | Total |
| RNF-024 | DRS §4.7.2, NF024 | BE-001 (M0 redigida), BE-014 (M0 redigida) | Total |
| RNF-025 | DRS §4.7.3, NF025 | FE-030 (M3 redigida) | Total |
| RN-001 | DRS §2.5, RN01 | BE-017 (M1 redigida), BE-020 (M1 redigida), BE-021 (M1 redigida), BE-024 (M1 redigida), BE-029 (M1 redigida), FE-017 (M1 redigida) | Total |
| RN-002 | DRS §2.5, RN02 | BE-016 (M1 redigida), BE-018 (M1 redigida), BE-021 (M1 redigida) | Total |
| RN-003 | DRS §2.5, RN03 | BE-019 (M1 redigida), BE-021 (M1 redigida), BE-024 (M1 redigida) | Total |
| RN-004 | DRS §2.5, RN04 | BE-022 (M1 redigida), BE-023 (M1 redigida), FE-014 (M1 redigida) | Total |
| RN-005 | DRS §2.5, RN05 | BE-006 (M0 redigida), BE-025 (M1 redigida), BE-027 (M1 redigida) | Total |
| RN-006 | DRS §2.5, RN06 | BE-021 (M1 redigida), BE-027 (M1 redigida) | Total |
| RN-007 | DRS §2.5, RN07 | BE-005 (M0 redigida), BE-030 (M2 redigida), BE-031 (M2 redigida), BE-032 (M2 redigida), BE-037 (M2 redigida), BE-043 (M2 redigida), FE-032 (M3 redigida) | Total |
| RN-008 | DRS §2.5, RN08 | BE-036 (M2 redigida), FE-022 (M2 redigida) | Total |
| RN-009 | DRS §2.5, RN09 | BE-038 (M2 redigida), BE-039 (M2 redigida), BE-040 (M2 redigida), BE-042 (M2 redigida), FE-024 (M2 redigida), FE-026 (M2 redigida), FE-041 (M2 redigida) | Total |
| RN-010 | DRS §2.5, RN10 | BE-044 (M3 redigida), BE-045 (M3 redigida) | Total |
| RN-011 | DRS §2.5, RN11 | BE-047 (M3 redigida), BE-053 (M3 redigida), BE-054 (M3 redigida), FE-034 (M3 redigida) | Total |
| RN-012 | DRS §2.5, RN12 | BE-015 (M0 redigida), BE-033 (M2 redigida), BE-036 (M2 redigida), BE-041 (M2 redigida), BE-042 (M2 redigida), BE-046 (M3 redigida) | Total |
| UI-001 | `apps/frontend/AGENTS.md`, “Regra de Layout e UI”, “Estilo visual”, “UX” | FE-001 (M0 redigida), FE-003 (M0 redigida) | Total |
| UI-002 | `apps/frontend/AGENTS.md`, “UX” | FE-002 (M0 redigida), FE-035 (M4 redigida) | Total |
| UI-003 | Design System §§1–7, 25–26, 29.1 | FE-001 (M0 redigida) | Total |
| UI-004 | Design System §8, 29.2 | FE-001 (M0 redigida) | Total |
| UI-005 | Design System §§9–10, 13, 29.3 | FE-001 (M0 redigida) | Total |
| UI-006 | Design System §11, 23, 29.6, 30 | FE-002 (M0 redigida) | Total |
| UI-007 | Design System §§12, 19, 21, 29.3–29.4 | FE-002 (M0 redigida) | Total |
| UI-008 | Design System §14, 20.1 | FE-003 (M0 redigida) | Total |
| UI-009 | Design System §§17, 31 | FE-015 (M1 redigida) | Total |
| UI-010 | Design System §§18, 32 | FE-021 (M2 redigida), FE-022 (M2 redigida), FE-023 (M2 redigida) | Total |
| UI-011 | Design System §20, 29.5 | FE-003 (M0 redigida), FE-015 (M1 redigida) | Total |
| UI-012 | Design System §§5–6, 21, 29.7, 30 | FE-002 (M0 redigida), FE-021 (M2 redigida), FE-023 (M2 redigida) | Total |
| UI-013 | Design System §§22–24, 35–36 | FE-002 (M0 redigida) | Total |
| UI-014 | Design System §27 | FE-001 (M0 redigida) | Total |
| UI-015 | Design System §§29–34, 37 | FE-002 (M0 redigida), FE-003 (M0 redigida) | Total |
| UI-016 | `apps/frontend/AGENTS.md`, “This is NOT the Next.js you know” | FE-001 (M0 redigida) | Total |

## Verificações e limites do lote

- **Cobertura de plano:** 85/85 requisitos/diretrizes têm ao menos uma spec mapeada; sem ID órfão. **Documentação M0–M4:** 85 itens com todas as specs redigidas em 95 arquivos (54 BE, 41 FE). Estados: 85 total, 0 parcial, 0 pendente. Conformidade operacional/jurídica permanece distinta.
- **Telas explicitamente desenhadas nos docs de front:** Agenda → FE-015/016/018 (M1 redigida); Prontuário → FE-021/022/023 (M2 redigida). Layouts das demais telas são propostas Q-14.
- **Desvios registrados:** RN-008 adendo sempre; RNF-013 inatividade interna 30 min; RNF-009 metas Q-22; RNF-022 compatibilidade estrutural; RN-005 segundo lembrete; RN-009/RNF-017 assinatura simulada parcial; RNF-014 mídia parcial.
- **Operação pendente:** RNF-006/007/024 dependem de infraestrutura real e medições; RNF-004 requer teste com usuários após treinamento; RNF-003/019/020/021/023 exigem verificação transversal quando as telas forem implementadas.
- **Implementação:** M0 em andamento conforme autorização posterior do usuário. Evidências por spec em `_work/03-implementation-progress.md`; cobertura documental não equivale à implementação.
- **Fechamento documental:** 32 RF, 25 RNF, 12 RN e 16 UI cobertos por 95 specs (54 BE, 41 FE); **sem requisito sem cobertura**. Agenda → FE-015/016/018; Prontuário → FE-021/022/023. Os 95 IDs são únicos, as dependências seguem a ordem topológica sem ciclo e todos os arquivos BE/FE têm as oito seções do template e critérios de aceite Dado/Quando/Então. Este resultado mede redação e não execução dos testes.

## Riscos arquiteturais aprovados A-01–A-10

| Risco | Documento/spec onde se aplica |
| --- | --- |
| A-01, A-02, A-03 | `backend/architecture.md`, BE-001/002/003 |
| A-04 | `shared/data-model.md`, `shared/api-contracts.md`, `shared/access-policy.md`, BE-003/005, FE-004 |
| A-05 | BE-020 (M1), `shared/business-rules.md` RN-001 |
| A-06 | `backend/architecture.md`, BE-006/013/014/015, BE-038/045/047 |
| A-07 | `backend/architecture.md`, `04-open-questions.md` P-04, BE-045/047 |
| A-08 | `shared/data-model.md`, BE-002 |
| A-09 | `03-implementation-order.md`, BE-004/005/016/020 |
| A-10 | `shared/performance-scenario.md`, BE-014/015/051/052 |

A cobertura documental está completa. Ao implementar, atualizar por requisito somente a cobertura efetivamente entregue e revisar os estados de limitação. “Total” documental nunca substitui a verificação de implantação/segurança.

## Cobertura implementada de M0

| Spec | Requisitos | Evidência | Limite |
| --- | --- | --- | --- |
| BE-001 | RNF-024 parcial | Configuração, composição e bootstrap; 3 testes Node aprovados e lint | Hospedagem nacional real ainda não comprovada |
| BE-002 | RF-001/RF-029/RNF-012 parcial | Migration e 3 testes PostgreSQL, lint | Casos de uso e autorização em specs posteriores |
| BE-003 | RNF-021 parcial | Testes HTTP de validação/404/409/500 sanitizado e lint | Mensagens dos módulos ainda serão integradas |
| BE-004 | RF-032/RNF-015 parcial | Testes de rollback, metadados e imutabilidade no PostgreSQL | Consulta/exportação BE-050; operação produtiva pendente |
| BE-005 | RF-029/RNF-012/RN-007 parcial | Guard HTTP, IDOR, DPO, revogação imediata e último admin sob concorrência; lint | Autenticador BE-008; vínculo clínico BE-030 permanece fechado |
| BE-006 | RF-013/RN-005 parcial | Outbox concorrente/idempotente, caixa local, política de preferência, retry e bloqueio de consentimento; testes e lint | Relógio de lembretes BE-025; consentimento BE-011 e provedor produtivo pendentes |
| BE-007 | RF-029/RNF-013 parcial | Seed em banco vazio, convite de uso único/expiração/reenvio/RBAC, revisão de inatividade, bcrypt; testes e lint | Login/MFA em BE-008; operação do job e provedor produtivo pendentes |
| BE-008 | RF-002/RNF-013 parcial | TOTP, login interno e de paciente consentido, JWT, refresh rotativo/reuse, idle, lock, cookies/Origin/CSRF; testes e lint | Domínio real de implantação não homologado; consentimento jurídico P-01 |
| BE-009 | RF-003/RF-005/RNF-013 parcial | Reset sem enumeração, limite, expiração/uso único, histórico, revogação, e-mail novo confirmado, telefone presencial; envio a paciente revalida consentimento | Provedor de e-mail produtivo e parecer P-01 pendentes |
| BE-010 | RF-001/RNF-016 parcial | CPF validado/único sob concorrência, perfis, vínculos e isolamento de dependentes; cadastro digital/presencial com aceite transacional publicado em BE-011 | Exceções legais P-01 e telas FE-007/039 pendentes |
| BE-013 | RF-020/RF-026/RF-027/RNF-014 parcial | Storage AES-256-GCM, MIME real, limite/quantidade, FileObject, link HMAC, auditoria de download; upload de termo em BE-011 | POST genérico de arquivos ainda sem contexto autorizável em M0; scanner real e regras clínicas em milestones posteriores |
| BE-011 | RF-004/RNF-016 parcial | Termos versionados e imutáveis, aceite/recusa/revogação auditados, cadastro transacional, evidência presencial cifrada, bloqueio imediato de portal/notificações, IDOR negado; 22 integrações/15 Node/2 Vitest e lint antes do último teste adicional | P-01 base legal e retenção final aguardam jurídico; contrato de arquivo genérico BE-013 ainda pendente |
| BE-012 | RF-005/RNF-016 parcial | Pedidos próprios/dependentes, prazo configurável, fila DPO/admin de fallback, metadados de consentimento auditados, decisões com retenção explícita e exportação M0 cifrada e auditada; teste dedicado e lint | P-01 impede decisão final de eliminação e canal assistido pós-revogação; exportação de módulos futuros ainda não existe |
| BE-014 | RNF-006/RNF-024 parcial | Health/readiness, logs estruturados sanitizados, métricas e alertas por rota/job/fila, registro auditado de manutenção com limites parametrizados; 2 testes Node/1 integração e lint | Destino de alertas, aviso externo efetivo, hospedagem nacional, escala e SLA mensal exigem ambiente P-07 |
| BE-015 | RNF-007/RNF-006/RN-012 parcial | pgBackRest completo/incremental + WAL contínuo, snapshots de arquivos AES-GCM com chave segregada, restore isolado de banco/WAL/arquivo, alerta em falha; 3 testes Node e ensaio local documentado | RPO/RTO de produção, localidade brasileira secundária, agenda ativa, retenção clínica real e rotação de gravação revogada exigem P-07/P-01/P-03 e módulos M2/M3 |
