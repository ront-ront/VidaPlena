# Matriz de rastreabilidade — requisitos → specs

**Atualização:** lote M0 da Fase 3. **Escopo da matriz:** 32 RF, 25 RNF, 12 RN do DRS e 16 UI extraídos dos documentos de front. Nenhum código de produção foi implementado nesta tarefa; o estado abaixo mede **documentação de spec**, não funcionalidade entregue.

## Legenda

- **Total:** todas as specs planejadas para o requisito já foram redigidas neste lote. Isso não significa implementação concluída.
- **Parcial:** pelo menos uma spec foi redigida, mas outra depende de lote futuro.
- **Pendente:** nenhuma spec do requisito foi redigida ainda; o mapeamento do plano existe.
- **Limite de conformidade:** `RN-009`/`RNF-017` exigem assinatura ICP-Brasil real; `RNF-014` exige fim a fim; implementação dev/P2P é parcial mesmo após specs redigidas. RNF-006/007/024 dependem de evidência operacional. Ver `04-open-questions.md`.

## Cobertura

| Requisito | Origem | Spec(s) e milestone | Cobertura documental M0 |
| --- | --- | --- | --- |
| RF-001 | DRS §3.1.1, RF001 | BE-002 (M0 redigida), BE-010 (M0 redigida), FE-007 (M0 redigida), FE-039 (M0 redigida), BE-028 (M1 planejada), FE-019 (M1 planejada) | Parcial |
| RF-002 | DRS §3.1.2, RF002 | BE-008 (M0 redigida), FE-004 (M0 redigida), FE-005 (M0 redigida) | Total |
| RF-003 | DRS §3.1.3, RF003 | BE-009 (M0 redigida), FE-006 (M0 redigida) | Total |
| RF-004 | DRS §3.1.4, RF004 | BE-011 (M0 redigida), FE-007 (M0 redigida), FE-008 (M0 redigida), FE-039 (M0 redigida), FE-038 (M4 planejada) | Parcial |
| RF-005 | DRS §3.1.5, RF005 | BE-009 (M0 redigida), BE-012 (M0 redigida), FE-008 (M0 redigida), FE-038 (M4 planejada) | Parcial |
| RF-006 | DRS §3.2.1, RF006 | BE-019 (M1 planejada), FE-012 (M1 planejada), FE-015 (M1 planejada) | Pendente |
| RF-007 | DRS §3.2.2, RF007 | BE-017 (M1 planejada), BE-021 (M1 planejada), BE-029 (M1 planejada), FE-010 (M1 planejada), FE-013 (M1 planejada), FE-016 (M1 planejada), FE-020 (M1 planejada) | Pendente |
| RF-008 | DRS §3.2.3, RF008 | BE-017 (M1 planejada), BE-020 (M1 planejada), BE-029 (M1 planejada), FE-013 (M1 planejada), FE-020 (M1 planejada), BE-051 (M4 planejada) | Pendente |
| RF-009 | DRS §3.2.4, RF009 | BE-022 (M1 planejada), FE-014 (M1 planejada), FE-016 (M1 planejada) | Pendente |
| RF-010 | DRS §3.2.5, RF010 | BE-023 (M1 planejada), FE-014 (M1 planejada), FE-016 (M1 planejada) | Pendente |
| RF-011 | DRS §3.2.6, RF011 | BE-018 (M1 planejada), FE-011 (M1 planejada) | Pendente |
| RF-012 | DRS §3.2.7, RF012 | BE-024 (M1 planejada), FE-017 (M1 planejada) | Pendente |
| RF-013 | DRS §3.2.8, RF013 | BE-006 (M0 redigida), BE-025 (M1 planejada) | Parcial |
| RF-014 | DRS §3.2.9, RF014 | BE-026 (M1 planejada), FE-015 (M1 planejada), FE-018 (M1 planejada) | Pendente |
| RF-015 | DRS §3.2.10, RF015 | BE-027 (M1 planejada), FE-015 (M1 planejada), FE-018 (M1 planejada) | Pendente |
| RF-016 | DRS §3.3.1, RF016 | BE-028 (M1 planejada), BE-030 (M2 planejada), BE-032 (M2 planejada), BE-033 (M2 planejada), FE-021 (M2 planejada), FE-029 (M2 planejada) | Pendente |
| RF-017 | DRS §3.3.2, RF017 | BE-034 (M2 planejada), BE-035 (M2 planejada), BE-036 (M2 planejada), FE-022 (M2 planejada) | Pendente |
| RF-018 | DRS §3.3.3, RF018 | BE-037 (M2 planejada), FE-023 (M2 planejada) | Pendente |
| RF-019 | DRS §3.3.4, RF019 | BE-039 (M2 planejada), FE-024 (M2 planejada) | Pendente |
| RF-020 | DRS §3.3.5, RF020 | BE-013 (M0 redigida), BE-034 (M2 planejada), BE-040 (M2 planejada), BE-041 (M2 planejada), FE-025 (M2 planejada) | Parcial |
| RF-021 | DRS §3.3.6, RF021 | BE-042 (M2 planejada), FE-026 (M2 planejada) | Pendente |
| RF-022 | DRS §3.3.7, RF022 | BE-032 (M2 planejada), BE-033 (M2 planejada), BE-043 (M2 planejada), FE-021 (M2 planejada), FE-027 (M2 planejada), FE-029 (M2 planejada) | Pendente |
| RF-023 | DRS §3.3.8, RF023 | BE-031 (M2 planejada), FE-028 (M2 planejada) | Pendente |
| RF-024 | DRS §3.4.1, RF024 | BE-044 (M3 planejada), FE-030 (M3 planejada) | Pendente |
| RF-025 | DRS §3.4.2, RF025 | BE-045 (M3 planejada), FE-030 (M3 planejada), FE-031 (M3 planejada), FE-032 (M3 planejada) | Pendente |
| RF-026 | DRS §3.4.3, RF026 | BE-013 (M0 redigida), BE-046 (M3 planejada), FE-033 (M3 planejada) | Parcial |
| RF-027 | DRS §3.4.4, RF027 | BE-013 (M0 redigida), BE-047 (M3 planejada), FE-034 (M3 planejada) | Parcial |
| RF-028 | DRS §3.5.1, RF028 | BE-016 (M1 planejada), FE-010 (M1 planejada) | Pendente |
| RF-029 | DRS §3.5.2, RF029 | BE-002 (M0 redigida), BE-005 (M0 redigida), BE-007 (M0 redigida), FE-006 (M0 redigida), FE-009 (M0 redigida) | Total |
| RF-030 | DRS §3.5.3, RF030 | BE-048 (M4 planejada), FE-035 (M4 planejada) | Pendente |
| RF-031 | DRS §3.5.4, RF031 | BE-049 (M4 planejada), FE-036 (M4 planejada) | Pendente |
| RF-032 | DRS §3.5.5, RF032 | BE-004 (M0 redigida), BE-050 (M4 planejada), FE-037 (M4 planejada), FE-038 (M4 planejada) | Parcial |
| RNF-001 | DRS §4.1.1, NF001 | FE-012 (M1 planejada), FE-013 (M1 planejada) | Pendente |
| RNF-002 | DRS §4.1.2, NF002 | FE-015 (M1 planejada), FE-016 (M1 planejada), FE-018 (M1 planejada) | Pendente |
| RNF-003 | DRS §4.1.3, NF003 | FE-002 (M0 redigida), FE-007 (M0 redigida), FE-027 (M2 planejada) | Parcial |
| RNF-004 | DRS §4.1.4, NF004 | FE-013 (M1 planejada), FE-015 (M1 planejada), FE-021 (M2 planejada) | Pendente |
| RNF-005 | DRS §4.2.1, NF005 | BE-033 (M2 planejada), BE-036 (M2 planejada), FE-029 (M2 planejada) | Pendente |
| RNF-006 | DRS §4.2.2, NF006 | BE-014 (M0 redigida), BE-015 (M0 redigida) | Total |
| RNF-007 | DRS §4.2.3, NF007 | BE-015 (M0 redigida) | Total |
| RNF-008 | DRS §4.2.4, NF008 | BE-035 (M2 planejada), FE-022 (M2 planejada), FE-031 (M3 planejada) | Pendente |
| RNF-009 | DRS §4.3.1, NF009 | BE-019 (M1 planejada), BE-032 (M2 planejada), BE-051 (M4 planejada) | Pendente |
| RNF-010 | DRS §4.3.2, NF010 | BE-020 (M1 planejada), BE-051 (M4 planejada), BE-052 (M4 planejada) | Pendente |
| RNF-011 | DRS §4.3.3, NF011 | BE-045 (M3 planejada), FE-032 (M3 planejada), BE-052 (M4 planejada) | Pendente |
| RNF-012 | DRS §4.4.1, NF012 | BE-002 (M0 redigida), BE-005 (M0 redigida), FE-004 (M0 redigida), FE-009 (M0 redigida), BE-030 (M2 planejada) | Parcial |
| RNF-013 | DRS §4.4.2, NF013 | BE-007 (M0 redigida), BE-008 (M0 redigida), BE-009 (M0 redigida), FE-004 (M0 redigida), FE-005 (M0 redigida) | Total |
| RNF-014 | DRS §4.4.3, NF014 | BE-013 (M0 redigida), BE-045 (M3 planejada), BE-047 (M3 planejada), FE-033 (M3 planejada), BE-052 (M4 planejada) | Parcial |
| RNF-015 | DRS §4.4.4, NF015 | BE-004 (M0 redigida), BE-031 (M2 planejada), FE-028 (M2 planejada), BE-049 (M4 planejada), BE-050 (M4 planejada), FE-037 (M4 planejada) | Parcial |
| RNF-016 | DRS §4.4.5, NF016 | BE-010 (M0 redigida), BE-011 (M0 redigida), BE-012 (M0 redigida), FE-008 (M0 redigida), BE-028 (M1 planejada), BE-043 (M2 planejada), BE-048 (M4 planejada), FE-035 (M4 planejada), FE-038 (M4 planejada) | Parcial |
| RNF-017 | DRS §4.4.6, NF017 | BE-038 (M2 planejada) | Pendente |
| RNF-018 | DRS §4.5.1, NF018 | FE-003 (M0 redigida), FE-031 (M3 planejada) | Parcial |
| RNF-019 | DRS §4.5.2, NF019 | FE-003 (M0 redigida), FE-007 (M0 redigida), FE-012 (M1 planejada), FE-027 (M2 planejada), FE-031 (M3 planejada) | Parcial |
| RNF-020 | DRS §4.6.1, NF020 | FE-001 (M0 redigida), FE-003 (M0 redigida) | Total |
| RNF-021 | DRS §4.6.2, NF021 | BE-003 (M0 redigida), FE-002 (M0 redigida), FE-013 (M1 planejada), FE-019 (M1 planejada), FE-020 (M1 planejada), FE-025 (M2 planejada), FE-036 (M4 planejada) | Parcial |
| RNF-022 | DRS §4.6.3, NF022 | BE-034 (M2 planejada) | Pendente |
| RNF-023 | DRS §4.7.1, NF023 | FE-031 (M3 planejada), FE-032 (M3 planejada) | Pendente |
| RNF-024 | DRS §4.7.2, NF024 | BE-001 (M0 redigida), BE-014 (M0 redigida) | Total |
| RNF-025 | DRS §4.7.3, NF025 | FE-030 (M3 planejada) | Pendente |
| RN-001 | DRS §2.5, RN01 | BE-017 (M1 planejada), BE-020 (M1 planejada), BE-021 (M1 planejada), BE-024 (M1 planejada), BE-029 (M1 planejada), FE-017 (M1 planejada) | Pendente |
| RN-002 | DRS §2.5, RN02 | BE-016 (M1 planejada), BE-018 (M1 planejada), BE-021 (M1 planejada) | Pendente |
| RN-003 | DRS §2.5, RN03 | BE-019 (M1 planejada), BE-021 (M1 planejada), BE-024 (M1 planejada) | Pendente |
| RN-004 | DRS §2.5, RN04 | BE-022 (M1 planejada), BE-023 (M1 planejada), FE-014 (M1 planejada) | Pendente |
| RN-005 | DRS §2.5, RN05 | BE-006 (M0 redigida), BE-025 (M1 planejada), BE-027 (M1 planejada) | Parcial |
| RN-006 | DRS §2.5, RN06 | BE-021 (M1 planejada), BE-027 (M1 planejada) | Pendente |
| RN-007 | DRS §2.5, RN07 | BE-005 (M0 redigida), BE-030 (M2 planejada), BE-031 (M2 planejada), BE-032 (M2 planejada), BE-037 (M2 planejada), BE-043 (M2 planejada), FE-032 (M3 planejada) | Parcial |
| RN-008 | DRS §2.5, RN08 | BE-036 (M2 planejada), FE-022 (M2 planejada) | Pendente |
| RN-009 | DRS §2.5, RN09 | BE-038 (M2 planejada), BE-039 (M2 planejada), BE-040 (M2 planejada), BE-042 (M2 planejada), FE-024 (M2 planejada), FE-026 (M2 planejada) | Pendente |
| RN-010 | DRS §2.5, RN10 | BE-044 (M3 planejada), BE-045 (M3 planejada) | Pendente |
| RN-011 | DRS §2.5, RN11 | BE-047 (M3 planejada), FE-034 (M3 planejada) | Pendente |
| RN-012 | DRS §2.5, RN12 | BE-015 (M0 redigida), BE-033 (M2 planejada), BE-036 (M2 planejada), BE-041 (M2 planejada), BE-042 (M2 planejada), BE-046 (M3 planejada) | Parcial |
| UI-001 | `apps/frontend/AGENTS.md`, “Regra de Layout e UI”, “Estilo visual”, “UX” | FE-001 (M0 redigida), FE-003 (M0 redigida) | Total |
| UI-002 | `apps/frontend/AGENTS.md`, “UX” | FE-002 (M0 redigida), FE-035 (M4 planejada) | Parcial |
| UI-003 | Design System §§1–7, 25–26, 29.1 | FE-001 (M0 redigida) | Total |
| UI-004 | Design System §8, 29.2 | FE-001 (M0 redigida) | Total |
| UI-005 | Design System §§9–10, 13, 29.3 | FE-001 (M0 redigida) | Total |
| UI-006 | Design System §11, 23, 29.6, 30 | FE-002 (M0 redigida) | Total |
| UI-007 | Design System §§12, 19, 21, 29.3–29.4 | FE-002 (M0 redigida) | Total |
| UI-008 | Design System §14, 20.1 | FE-003 (M0 redigida) | Total |
| UI-009 | Design System §§17, 31 | FE-015 (M1 planejada) | Pendente |
| UI-010 | Design System §§18, 32 | FE-021 (M2 planejada), FE-022 (M2 planejada), FE-023 (M2 planejada) | Pendente |
| UI-011 | Design System §20, 29.5 | FE-003 (M0 redigida), FE-015 (M1 planejada) | Parcial |
| UI-012 | Design System §§5–6, 21, 29.7, 30 | FE-002 (M0 redigida), FE-021 (M2 planejada), FE-023 (M2 planejada) | Parcial |
| UI-013 | Design System §§22–24, 35–36 | FE-002 (M0 redigida) | Total |
| UI-014 | Design System §27 | FE-001 (M0 redigida) | Total |
| UI-015 | Design System §§29–34, 37 | FE-002 (M0 redigida), FE-003 (M0 redigida) | Total |
| UI-016 | `apps/frontend/AGENTS.md`, “This is NOT the Next.js you know” | FE-001 (M0 redigida) | Total |

## Verificações e limites do lote

- **Cobertura de plano:** 85/85 requisitos/diretrizes têm ao menos uma spec mapeada; sem ID órfão. **Documentação M0:** 41 itens com ao menos uma spec M0 redigida em 25 specs (15 BE, 10 FE); os demais aguardam seus lotes.
- **Telas explicitamente desenhadas nos docs de front:** Agenda → FE-015/016/018 (M1 pendente); Prontuário → FE-021/022/023 (M2 pendente). Layouts das demais telas são propostas Q-14.
- **Desvios registrados:** RN-008 adendo sempre; RNF-013 inatividade interna 30 min; RNF-009 metas Q-22; RNF-022 compatibilidade estrutural; RN-005 segundo lembrete; RN-009/RNF-017 assinatura simulada parcial; RNF-014 mídia parcial.
- **Operação pendente:** RNF-006/007/024 dependem de infraestrutura real e medições; RNF-004 requer teste com usuários após treinamento; RNF-003/019/020/021/023 exigem verificação transversal nas telas futuras.
- **Implementação:** pendente para todos os IDs. Esta tarefa cria especificações, não altera código-fonte.

## Riscos arquiteturais aprovados A-01–A-10

| Risco | Documento/spec onde se aplica |
| --- | --- |
| A-01, A-02, A-03 | `backend/architecture.md`, BE-001/002/003 |
| A-04 | `shared/data-model.md`, `shared/api-contracts.md`, `shared/access-policy.md`, BE-003/005, FE-004 |
| A-05 | BE-020 (M1), `shared/business-rules.md` RN-001 |
| A-06 | `backend/architecture.md`, BE-006/013/014/015, BE-038/045/047 futuros |
| A-07 | `backend/architecture.md`, `04-open-questions.md` P-04, BE-045/047 futuros |
| A-08 | `shared/data-model.md`, BE-002 |
| A-09 | `03-implementation-order.md`, BE-004/005/016/020 |
| A-10 | `shared/performance-scenario.md`, BE-014/015/051/052 |

Ao concluir M1–M4, atualizar esta matriz por requisito, manter IDs sem cobertura explicitados e revisar os estados de limitação. “Total” documental nunca substitui a verificação de implantação/segurança.
