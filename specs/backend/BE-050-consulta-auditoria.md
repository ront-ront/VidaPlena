# BE-050 - Consulta/exportação auditada da trilha

- **Software:** back
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** BE-004, BE-005, BE-031
- **Requisitos cobertos:** RF-032, RNF-015

## 1. Objetivo
Oferecer pesquisa cronológica e exportação de AuditEvent para admin e detentor de privacy.dpo sem permitir alteração dos eventos.

## 2. Escopo
- Inclui filtros, cursor, destaque de urgência/permissões, exportação e auditoria da própria leitura. NÃO inclui conteúdo clínico nem acesso DPO ao prontuário.

## 3. Contexto necessário
Ler DRS §3.5.5/§4.4.4, Q-20, shared/api-contracts.md#m4 (audit), shared/access-policy.md, shared/data-model.md#m4 e backend/architecture.md.

## 4. Detalhamento
GET audit-events filtra por período/ator/paciente/tipo, ordena occurredAt+id e retorna metadados seguros; usuário admin consulta auditoria, gestor só com privacy.dpo. Consulta é registrada na trilha, sem incluir sua própria inserção no mesmo snapshot para evitar recursão. POST audit-exports exige motivo, usa job e arquivo autorizado; GET job e download revalidam permissão atual. Índices de AuditEvent suportam filtros; nenhum endpoint UPDATE/DELETE e papel do banco de app não recebe permissões para alterar/apagar trilha. Destaque urgency/permissionChange deriva do tipo de evento, sem texto clínico.

## 5. Critérios de aceite
- [ ] Dado usuário sem admin/privacy.dpo, quando consultar, então 403.
- [ ] Dado DPO, quando pesquisar, então vê metadados, não evolução/anexo.
- [ ] Dada consulta/exportação, quando concluir, então há novo AuditEvent com ator/filtros e recurso.
- [ ] Dado admin, quando tentar alterar/apagar evento, então API inexiste e banco nega.
- [ ] Dado evento urgente, quando listar, então flag específica aparece.

## 6. Testes esperados
Filtros/cursor, permissões/MFA, metadados, auditoria da própria consulta, exportação e imutabilidade do banco; lint.

## 7. Definition of Done
- [ ] Sem rota de mutação da trilha; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
P-08 confirma designação formal e possível ampliação RF-032.
