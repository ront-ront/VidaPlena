# Ordem de implementação e dependências

**Estado:** lotes M0–M4 da Fase 3 redigidos; o usuário autorizou a conclusão dos lotes M2–M4 em 23/10/2026. Esta ordem deriva do plano aprovado em `_work/02-plan.md`. Cada linha é uma sessão de implementação de uma spec; ler primeiro `00-constitution.md`, depois os documentos compartilhados citados pela spec. Contratos de cada marco foram completados em `shared/api-contracts.md` e `shared/data-model.md` antes de redigir e implementar o respectivo lote.

## Milestones e critérios de saída

| Milestone | Valor verificável | Situação documental |
| --- | --- | --- |
| M0 — Fundação | Ambiente, identidade, cadastro, consentimento, autorização, auditoria, arquivos e base operacional. | 25/25 specs redigidas; implementação pendente. |
| M1 — Agenda | Catálogo, grade, salas, reserva concorrente, consultas, lista de espera, lembretes, recepção e CSV. | 25/25 specs redigidas; implementação pendente. |
| M2 — Prontuário | Vínculo, histórico, evolução/adendo, alertas, documentos, acesso de urgência e projeção do paciente. | 25/25 specs redigidas; implementação e portões P-02/P-06/P-11/P-13 pendentes. |
| M3 — Teleconsulta | Termo, vídeo P2P, arquivos e gravação revogável. | 11/11 specs redigidas; RNF-014 parcial e portões P-03/P-04/P-10 pendentes. |
| M4 — Gestão | Indicadores, relatórios, auditoria consultável e ensaios de desempenho. | 9/9 specs redigidas; produção depende de P-07/P-14. |

## Regra de execução

1. Implementar **somente uma spec por vez e nunca fora do escopo dela**.
2. Antes de cada spec, resolver as dependências executáveis e ler o contrato compartilhado correspondente. Uma spec documental redigida não comprova que sua dependência foi implementada.
3. Não iniciar uma spec bloqueada por decisão em `04-open-questions.md`. Os valores provisórios de `shared/parameters.md` permitem testes documentais, mas não substituem validação para produção.
4. Usar `yarn lint` para verificação estática; **nunca executar `tsc` para testes**. Executar os testes funcionais próprios de cada spec quando implementada.
5. Ao fim de cada milestone documental, atualizar `02-traceability-matrix.md`. O usuário autorizou em 23/10/2026 a conclusão dos lotes restantes; registrar cada lote antes de avançar.

## Grafo entre milestones

```mermaid
flowchart LR
    M0["M0 Fundação"] --> M1["M1 Agenda"]
    M1 --> M2["M2 Prontuário"]
    M2 --> M3["M3 Teleconsulta"]
    M1 --> M4["M4 Gestão"]
    M2 --> M4
    M3 --> M4
```

## Sequência topológica

| Ordem | Marco | Spec | Título | Software | Depende de | Situação |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | M0 | [BE-001](backend/BE-001-configuracao-ambientes.md) | Configuração, ambientes e composition root | back | — | Redigida |
| 2 | M0 | [BE-002](backend/BE-002-schema-identidade.md) | Schema Prisma inicial e migrations de identidade | back | BE-001 | Redigida |
| 3 | M0 | [BE-003](backend/BE-003-contrato-http-erros.md) | Contrato HTTP, validação e erros | back | BE-001 | Redigida |
| 4 | M0 | [BE-004](backend/BE-004-escrita-auditoria.md) | Escrita imutável da trilha de auditoria | back | BE-002, BE-003 | Redigida |
| 5 | M0 | [BE-005](backend/BE-005-rbac-dpo.md) | RBAC, privacy.dpo e autorização por recurso | back | BE-002, BE-004 | Redigida |
| 6 | M0 | [BE-006](backend/BE-006-dispatcher-notificacoes.md) | Dispatcher de notificações, EmailSender e portal | back | BE-003, BE-004 | Redigida |
| 7 | M0 | [BE-007](backend/BE-007-seed-convites-internos.md) | Seed do admin e convite de usuários internos | back | BE-005, BE-006 | Redigida |
| 8 | M0 | [BE-008](backend/BE-008-login-mfa-sessoes.md) | Login, MFA, sessões e bloqueio por tentativas | back | BE-005, BE-007 | Redigida |
| 9 | M0 | [BE-009](backend/BE-009-recuperacao-contatos.md) | Recuperação de senha e confirmação de contato | back | BE-006, BE-008 | Redigida |
| 10 | M0 | [BE-010](backend/BE-010-cadastro-paciente-responsavel.md) | Cadastro de paciente, responsável e dependentes | back | BE-002, BE-003, BE-006 | Redigida |
| 11 | M0 | [BE-013](backend/BE-013-arquivos-scanner.md) | FileStorage cifrado, links e MalwareScanner de desenvolvimento | back | BE-004, BE-005 | Redigida |
| 12 | M0 | [BE-011](backend/BE-011-consentimento-dados.md) | Versões, aceite presencial e revogação de consentimento | back | BE-004, BE-010, BE-013 | Redigida |
| 13 | M0 | [BE-012](backend/BE-012-solicitacoes-titular.md) | Solicitações do titular, exportação e fila do DPO | back | BE-005, BE-011 | Redigida |
| 14 | M0 | [BE-014](backend/BE-014-observabilidade.md) | Health, logs, métricas e alertas operacionais | back | BE-001, BE-004 | Redigida |
| 15 | M0 | [BE-015](backend/BE-015-backup-restauracao.md) | Backup, restauração e retenção operacional | back | BE-002, BE-014 | Redigida |
| 16 | M0 | [FE-001](frontend/FE-001-tokens-tema.md) | Tokens, fontes e alternância de tema | front | — | Redigida |
| 17 | M0 | [FE-002](frontend/FE-002-primitives-estados.md) | Primitives, estados e acessibilidade de base | front | FE-001 | Redigida |
| 18 | M0 | [FE-003](frontend/FE-003-shell-rotas.md) | Shell responsivo, navegação e rotas por perfil | front | FE-001, FE-002, BE-005 | Redigida |
| 19 | M0 | [FE-004](frontend/FE-004-cliente-http-sessao.md) | Cliente HTTP, sessão e proteção de rotas | front | FE-003, BE-003, BE-008 | Redigida |
| 20 | M0 | [FE-005](frontend/FE-005-login-mfa.md) | Tela de login e desafio MFA | front | FE-004, BE-008 | Redigida |
| 21 | M0 | [FE-006](frontend/FE-006-convite-recuperacao.md) | Telas de convite e recuperação de acesso | front | FE-004, BE-007, BE-009 | Redigida |
| 22 | M0 | [FE-007](frontend/FE-007-cadastro-dependentes-consentimento.md) | Autocadastro, dependentes e consentimento inicial | front | FE-002, FE-004, BE-010, BE-011 | Redigida |
| 23 | M0 | [FE-008](frontend/FE-008-perfil-privacidade.md) | Perfil, contatos, consentimentos e direitos do titular | front | FE-004, BE-009, BE-011, BE-012 | Redigida |
| 24 | M0 | [FE-009](frontend/FE-009-administracao-contas.md) | Administração de contas, perfis e convites | front | FE-003, FE-004, BE-005, BE-007 | Redigida |
| 25 | M0 | [FE-039](frontend/FE-039-cadastro-presencial-consentimento.md) | Cadastro presencial de paciente e consentimento assinado | front | FE-003, FE-004, BE-010, BE-011, BE-013 | Redigida |
| 26 | M1 | [BE-016](backend/BE-016-profissionais-especialidades.md) | Profissionais, especialidades e duração padrão | back | BE-005, BE-007 | Redigida |
| 27 | M1 | [BE-017](backend/BE-017-salas.md) | Cadastro e inativação de salas | back | BE-005, BE-016 | Redigida |
| 28 | M1 | [BE-018](backend/BE-018-grade-bloqueios.md) | Grade, férias e bloqueios do profissional | back | BE-016, BE-004 | Redigida |
| 29 | M1 | [BE-019](backend/BE-019-disponibilidade.md) | Consulta de disponibilidade e antecedência | back | BE-017, BE-018 | Redigida |
| 30 | M1 | [BE-020](backend/BE-020-reserva-atomica.md) | Reserva atômica sem sobreposição | back | BE-017, BE-018, BE-019 | Redigida |
| 31 | M1 | [BE-021](backend/BE-021-confirmacao-consulta.md) | Confirmação de consulta e alocação de sala | back | BE-010, BE-011, BE-020, BE-006 | Redigida |
| 32 | M1 | [BE-022](backend/BE-022-reagendamento.md) | Reagendamento transacional | back | BE-020, BE-021 | Redigida |
| 33 | M1 | [BE-023](backend/BE-023-cancelamento.md) | Cancelamento e liberação de horário | back | BE-021, BE-006 | Redigida |
| 34 | M1 | [BE-024](backend/BE-024-espera-encaixe.md) | Espera, oferta e encaixe fora da grade | back | BE-020, BE-023, BE-006 | Redigida |
| 35 | M1 | [BE-025](backend/BE-025-lembretes.md) | Lembretes, respostas, preferências e retry | back | BE-006, BE-021, BE-023 | Redigida |
| 36 | M1 | [BE-026](backend/BE-026-checkin-fila.md) | Check-in e fila de atendimento | back | BE-021, BE-022 | Redigida |
| 37 | M1 | [BE-027](backend/BE-027-ausencia-suspensao.md) | No-show, justificativas e suspensão online | back | BE-025, BE-026 | Redigida |
| 38 | M1 | [BE-028](backend/BE-028-importacao-pacientes.md) | Importação CSV demonstrativa de pacientes | back | BE-010, BE-011, BE-004 | Redigida |
| 39 | M1 | [BE-029](backend/BE-029-importacao-agenda.md) | Importação CSV demonstrativa de agenda | back | BE-016, BE-017, BE-020, BE-028 | Redigida |
| 40 | M1 | [FE-010](frontend/FE-010-catalogo-salas.md) | Gestão de especialidades, profissionais e salas | front | FE-003, FE-004, BE-016, BE-017 | Redigida |
| 41 | M1 | [FE-011](frontend/FE-011-grade-profissional.md) | Grade e bloqueios do profissional | front | FE-010, BE-018 | Redigida |
| 42 | M1 | [FE-012](frontend/FE-012-busca-horarios.md) | Busca de especialidade e horários do paciente | front | FE-003, FE-004, BE-019 | Redigida |
| 43 | M1 | [FE-013](frontend/FE-013-confirmacao-agendamento.md) | Confirmação de agendamento do paciente | front | FE-007, FE-012, BE-021 | Redigida |
| 44 | M1 | [FE-014](frontend/FE-014-minhas-consultas.md) | Minhas consultas, reagendar e cancelar | front | FE-013, BE-022, BE-023 | Redigida |
| 45 | M1 | [FE-015](frontend/FE-015-agenda-recepcao.md) | Agenda operacional da recepção | front | FE-003, BE-021, BE-026, BE-027 | Redigida |
| 46 | M1 | [FE-016](frontend/FE-016-operacao-consultas-recepcao.md) | Agendar e alterar consulta pela recepção | front | FE-015, BE-021, BE-022, BE-023 | Redigida |
| 47 | M1 | [FE-017](frontend/FE-017-espera-encaixe.md) | Lista de espera e encaixe | front | FE-012, FE-015, BE-024 | Redigida |
| 48 | M1 | [FE-018](frontend/FE-018-checkin-atrasos.md) | Check-in, atrasos e no-show na agenda | front | FE-015, BE-026, BE-027 | Redigida |
| 49 | M1 | [FE-019](frontend/FE-019-csv-pacientes.md) | Prévia e confirmação do CSV de pacientes | front | FE-009, BE-028 | Redigida |
| 50 | M1 | [FE-020](frontend/FE-020-csv-agenda.md) | Prévia e confirmação do CSV de agenda | front | FE-015, FE-019, BE-029 | Redigida |
| 51 | M2 | [BE-030](backend/BE-030-vinculo-assistencial.md) | Vínculo assistencial, janelas e reconciliação da agenda existente | back | BE-005, BE-021, BE-023, BE-027 | Redigida |
| 52 | M2 | [BE-031](backend/BE-031-acesso-urgencia.md) | Acesso de urgência, expiração e revisão | back | BE-030, BE-004, BE-006 | Redigida |
| 53 | M2 | [BE-032](backend/BE-032-leitura-prontuario.md) | Leitura do prontuário e timeline auditada | back | BE-030, BE-004, BE-013 | Redigida |
| 54 | M2 | [BE-033](backend/BE-033-historico-importado.md) | Lançamento manual de histórico importado | back | BE-032, BE-005 | Redigida |
| 55 | M2 | [BE-034](backend/BE-034-cid-tuss.md) | Catálogos locais CID-10 e TUSS | back | BE-002, BE-003 | Redigida |
| 56 | M2 | [BE-035](backend/BE-035-rascunho-evolucao.md) | Rascunho e salvamento periódico da evolução | back | BE-032, BE-034 | Redigida |
| 57 | M2 | [BE-036](backend/BE-036-finalizacao-adendos.md) | Finalização imutável e adendos justificados | back | BE-035, BE-004 | Redigida |
| 58 | M2 | [BE-037](backend/BE-037-alertas-clinicos.md) | Alergias, condições críticas e alertas | back | BE-032, BE-004 | Redigida |
| 59 | M2 | [BE-038](backend/BE-038-catalogo-assinatura.md) | Catálogo documental e SignatureProvider | back | BE-013, BE-034, BE-004 | Redigida |
| 60 | M2 | [BE-039](backend/BE-039-prescricao.md) | Prescrição e verificação de alergia | back | BE-037, BE-038, BE-036 | Redigida |
| 61 | M2 | [BE-040](backend/BE-040-pedidos-exames.md) | Pedidos de exames assinados | back | BE-038, BE-034, BE-036 | Redigida |
| 62 | M2 | [BE-041](backend/BE-041-resultados-exames.md) | Anexo de resultados e aviso ao profissional | back | BE-040, BE-013, BE-006 | Redigida |
| 63 | M2 | [BE-042](backend/BE-042-documentos-clinicos.md) | Atestados e demais documentos clínicos | back | BE-038, BE-036 | Redigida |
| 64 | M2 | [BE-043](backend/BE-043-projecao-paciente.md) | Projeção autorizada do histórico do paciente | back | BE-032, BE-039, BE-041, BE-042, BE-012 | Redigida |
| 65 | M2 | [FE-021](frontend/FE-021-prontuario-timeline.md) | Agenda clínica, cabeçalho e timeline do prontuário | front | FE-003, BE-030, BE-032, BE-037 | Redigida |
| 66 | M2 | [FE-022](frontend/FE-022-editor-evolucao.md) | Editor de evolução, rascunho e adendo | front | FE-021, BE-034, BE-035, BE-036 | Redigida |
| 67 | M2 | [FE-023](frontend/FE-023-alertas-criticos.md) | Alertas clínicos e condições críticas | front | FE-021, BE-037 | Redigida |
| 68 | M2 | [FE-024](frontend/FE-024-prescricao.md) | Prescrição e assinatura de desenvolvimento | front | FE-021, FE-023, BE-039 | Redigida |
| 69 | M2 | [FE-025](frontend/FE-025-exames-profissional.md) | Solicitação de exames e resultados | front | FE-021, BE-040, BE-041 | Redigida |
| 70 | M2 | [FE-026](frontend/FE-026-emissao-documentos-clinicos.md) | Emissão e consulta de documentos clínicos | front | FE-021, BE-042 | Redigida |
| 71 | M2 | [FE-027](frontend/FE-027-historico-documentos-paciente.md) | Histórico e documentos do paciente | front | FE-008, BE-043 | Redigida |
| 72 | M2 | [FE-028](frontend/FE-028-acesso-urgencia.md) | Solicitação de acesso de urgência | front | FE-021, BE-031 | Redigida |
| 73 | M2 | [FE-029](frontend/FE-029-historico-importado.md) | Entrada e conferência de histórico importado | front | FE-021, BE-033 | Redigida |
| 74 | M2 | [FE-040](frontend/FE-040-envio-resultados.md) | Envio de resultados pelo paciente e recepção | front | FE-003, FE-004, FE-027, BE-041 | Redigida |
| 75 | M2 | [FE-041](frontend/FE-041-tipos-documentais.md) | Configuração de tipos documentais | front | FE-003, FE-004, BE-038 | Redigida |
| 76 | M3 | [BE-044](backend/BE-044-consentimento-teleconsulta.md) | Consentimento específico de teleconsulta | back | BE-011, BE-021, BE-004 | Redigida |
| 77 | M3 | [BE-045](backend/BE-045-sinalizacao-video.md) | Sessão, autorização e sinalização WebSocket | back | BE-044, BE-030, BE-006 | Redigida |
| 78 | M3 | [BE-046](backend/BE-046-arquivos-sessao.md) | Compartilhamento de arquivos na sessão | back | BE-045, BE-013, BE-041 | Redigida |
| 79 | M3 | [BE-047](backend/BE-047-consentimento-gravacao.md) | Consentimento específico de gravação | back | BE-045, BE-004 | Redigida |
| 80 | M3 | [BE-053](backend/BE-053-upload-gravacao.md) | Recebimento e guarda de gravação auxiliar | back | BE-047, BE-013 | Redigida |
| 81 | M3 | [BE-054](backend/BE-054-revogacao-gravacao.md) | Revogação e expurgo de gravação | back | BE-053, BE-004 | Redigida |
| 82 | M3 | [FE-030](frontend/FE-030-preparo-teleconsulta.md) | Termo, preparo e teste de dispositivos | front | FE-014, BE-044, BE-045 | Redigida |
| 83 | M3 | [FE-031](frontend/FE-031-sala-paciente.md) | Sala de espera e vídeo do paciente | front | FE-030, BE-045 | Redigida |
| 84 | M3 | [FE-032](frontend/FE-032-sala-profissional.md) | Sala de vídeo e prontuário do profissional | front | FE-021, FE-030, BE-045 | Redigida |
| 85 | M3 | [FE-033](frontend/FE-033-arquivos-teleconsulta.md) | Compartilhamento de arquivos em teleconsulta | front | FE-031, FE-032, BE-046 | Redigida |
| 86 | M3 | [FE-034](frontend/FE-034-gravacao-revogacao.md) | Controles e aviso de gravação/revogação | front | FE-031, FE-032, BE-054 | Redigida |
| 87 | M4 | [BE-048](backend/BE-048-indicadores-agregados.md) | Indicadores agregados e proteção contra reidentificação | back | BE-021, BE-027, BE-030 | Redigida |
| 88 | M4 | [BE-049](backend/BE-049-relatorios-exportacao.md) | Relatórios e exportação síncrona/assíncrona | back | BE-048, BE-006, BE-004 | Redigida |
| 89 | M4 | [BE-050](backend/BE-050-consulta-auditoria.md) | Consulta/exportação auditada da trilha | back | BE-004, BE-005, BE-031 | Redigida |
| 90 | M4 | [BE-051](backend/BE-051-ensaios-carga.md) | Massa reprodutível e ensaios de carga/concorrência da API | back | BE-020, BE-032, BE-048, BE-049 | Redigida |
| 91 | M4 | [BE-052](backend/BE-052-ensaios-video.md) | Ensaios de qualidade/capacidade da teleconsulta | back | BE-045, BE-054 | Redigida |
| 92 | M4 | [FE-035](frontend/FE-035-painel-indicadores.md) | Painel gerencial de indicadores | front | FE-003, BE-048 | Redigida |
| 93 | M4 | [FE-036](frontend/FE-036-relatorios.md) | Relatórios e exportação | front | FE-035, BE-049 | Redigida |
| 94 | M4 | [FE-037](frontend/FE-037-auditoria.md) | Pesquisa e exportação de auditoria | front | FE-003, BE-050 | Redigida |
| 95 | M4 | [FE-038](frontend/FE-038-fila-dpo.md) | Fila do DPO e revisão de consentimentos | front | FE-008, FE-037, BE-012, BE-050 | Redigida |

## Pontos de atenção na ordem

- **M0:** BE-008/009 e FE-005 usam decisões pendentes sobre método de MFA, bloqueio por tentativas e histórico de senhas (P-05). FE-004 precisa de política final de cookie, CSRF e confirmação de telefone (P-12). A documentação existe; a implementação dessas partes depende das decisões.
- **M1:** BE-020 é a barreira transacional de sobreposição para profissional e sala. Confirmação, reagendamento, encaixe e importação da agenda passam por ela.
- **M2:** BE-030 reconcilia consultas já confirmadas no M1 ao criar o vínculo clínico. BE-033/FE-029 aguardam decisão P-11 sobre quem pode lançar conteúdo clínico histórico.
- **M3:** o adaptador de assinatura dev e a solução de mídia P2P não demonstram validade jurídica nem E2E pleno. Ver limites em `04-open-questions.md`.
- **M4:** RNF-006/007/024 exigem ensaio e infraestrutura de homologação/produção; relatório documental, por si, não prova metas operacionais.

## Verificação das dependências

O plano contém **95 IDs únicos** (54 BE, 41 FE). Cada dependência declarada aparece antes da spec dependente na sequência acima. Portanto, o grafo planejado é acíclico. A verificação deve ser refeita se IDs ou dependências mudarem nos lotes seguintes. O estado de cobertura por requisito está em `02-traceability-matrix.md`.
