# BE-030 - Vínculo assistencial, janelas e reconciliação da agenda existente

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** fundação implementada e verificada localmente; integração de autoria em BE-035/036 pendente; leitura clínica BE-032 integrada
- **Depende de:** BE-005, BE-021, BE-023, BE-027
- **Requisitos cobertos:** RN-007, RF-016, RNF-012

## 1. Objetivo
Criar `CareLink` individual como base de autorização clínica, reconciliando consultas M1 e mantendo janelas antes/depois do atendimento.

## 2. Escopo
- Inclui: migration, criação/renovação/encerramento por consulta, compartilhamento e substituição temporária auditados, guard de vínculo.
- NÃO inclui: leitura do prontuário (BE-032), urgência (BE-031) ou vínculo automático entre colegas.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2`, `specs/shared/api-contracts.md#m2` (vínculo), `specs/shared/access-policy.md`, `specs/shared/parameters.md` (`access.link_*`), DRS RN-007/§3.3.1 e Q-21/P-06.

## 4. Detalhamento
- Confirmação de consulta cria vínculo profissional-paciente com origem/ID da consulta; BE-030 reconcilia consultas confirmadas antes do M2, idempotentemente, e registra hook transacional para novas. Pré-consulta autoriza leitura limitada a partir de `access.link_pre_hours`; durante, atos clínicos conforme papel; após último atendimento, leitura até `access.link_post_days`. Novo atendimento renova; cancelamento prévio encerra; no-show usa `access.link_noshow_days`.
- Após expiração, profissional acessa somente evoluções próprias, não prontuário inteiro. Compartilhamento pelo profissional responsável depende de `access.shared_case_enabled`, motivo/prazo e audit trail; gestor pode conceder cobertura temporária justificada, sem ler conteúdo. Recepção nunca recebe vínculo.
- Guard resolve base por recurso/tempo em toda requisição, registra `CareLink.id` em auditoria e falha fechado sem parâmetro decidido. Política provisória entre especialidades aprovada em24/11/2026, descrita em `shared/access-policy.md`; pré-consulta continua limitada e leitura integra BE-032.

## 5. Critérios de aceite
- [ ] Dado profissional sem vínculo, quando acessar recurso clínico, então 404/negação auditada; vínculo expirado também nega, exceto evolução própria.
- [x] Dada consulta M1 já confirmada, quando rodar reconciliação duas vezes, então um único vínculo válido é criado.
- [x] Dado cancelamento prévio/no-show/novo atendimento, quando atualizar, então janelas usam `access.link_pre_hours`, `access.link_noshow_days` e `access.link_post_days` sem órfãos.
- [x] Dado compartilhamento/cobertura, quando conceder, então motivo, concedente, prazo e alvo ficam auditados; gestor não passa a ler prontuário.

## 6. Testes esperados
Relógio injetado nas três janelas, reconciliação idempotente, cancelamento, autoria própria, compartilhamento/cobertura, IDOR e auditoria; lint.

## 7. Definition of Done
- [x] P-06 resolvido antes de habilitar leitura clínica; guard servidor único integrado ao RBAC.
- [x] Testes/lint passam; nenhuma concessão clínica por papel administrativo, sem `tsc`.

## 8. Suposições e pontos em aberto
P-06 liberada pelo usuário em24/11/2026 com defaults provisórios/política de campos; homologação clínica antes de produção permanece pendente. Exceção de leitura de evolução própria exige recurso concreto de BE-035/036; por isso o primeiro critério permanece aberto até essa integração, sem simular autoria por parâmetro do cliente.

## Evidência local —24/11/2026

Migration `202611240030_care_links`, origem/FKs/identidade imutável/sem DELETE; janelas por Zod/Temporal, sincronização transacional no histórico da agenda, cancelamento/remarcação/ausência/encaixe/CSV e reconciliação CLI/startup. Base atual da consulta é revalidada no guard; concessões derivadas não contornam fase pré-consulta e são revogadas/auditadas quando a origem termina ou muda de janela. Motivos cifrados, metadados mínimos, papéis/MFA recarregados, paginação própria no banco e schemas únicos Zod/OpenAPI.

89/89 integrações de consumidores M1+fundação e revisão posterior10/10 BE-030 aprovadas;28/28 Node,2/2 Vitest, lint do escopo e diff aprovados. Conjuntos se sobrepõem. Testes cobrem fronteiras/DST, reconciliação/reinício, no-show, troca profissional, rollback consulta/reserva/vínculo por falha de auditoria, compartilhamento/limite/flag/delegação, revogação de derivados, substituição sem leitura administrativa, papéis/MFA, paginação/cursor, cifragem e OpenAPI. Logs `/tmp/vidaplena-be030-{consumers,audit-final-integration,final-node,vitest,scope-lint}.log`. Banco descartável (porta atual32769, não desenvolvimento). Nenhum tsc. BE-032 ainda não expõe prontuário; autoria própria será exercitada com evolução real, sem declarar critério concluído antecipadamente.
