# BE-005 - RBAC, privacy.dpo e autorização por recurso

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-002, BE-004
- **Requisitos cobertos:** RF-029, RNF-012, RN-007

## 1. Objetivo
Aplicar cinco papéis e concessões explícitas no servidor, com `privacy.dpo` separado de acesso clínico. Criar a porta de autorização usada por todas as próximas specs.

## 2. Escopo
- Inclui: papéis/permissões, guard de endpoint/recurso, concessão/revogação DPO, revogação imediata e proteção do último admin.
- NÃO inclui: tela de gestão, login/sessão (BE-007/008) ou vínculo clínico temporal (BE-030).

## 3. Contexto necessário
Ler `specs/shared/access-policy.md` inteiro, `specs/shared/data-model.md` (atribuições), `specs/shared/api-contracts.md` (rotas admin), DRS §§2.2/4.4.1 e Q-20.

## 4. Detalhamento
- Seed de definições de cinco papéis e permissões pequenas; `privacy.dpo` é grant direto permitido só em conta interna admin/gestor. Concessão/revogação por admin gera evento de auditoria; sem DPO, alerta e fila de titulares acessível ao admin.
- Guard valida sessão ativa, papel, permissão e relação com recurso. Para prontuário futuro, apenas papel profissional não basta: exigir `CareLink` ou urgência (BE-030/031). Admin/gestor/recepção nunca recebem conteúdo clínico por papel ou DPO.
- Mudança de papel, DPO ou status invalida autorização imediatamente, inclusive sessão ativa. Impedir remover/desativar última conta admin ativa.

## 5. Critérios de aceite
- [ ] Dado usuário com ID de outro paciente, quando chamar recurso pessoal, então servidor nega mesmo que URL seja manipulada.
- [ ] Dado DPO gestor, quando pedir auditoria/consentimentos, então autoriza metadados; quando pedir evolução/anexo clínico, então nega.
- [ ] Dado admin que revoga permissão, quando usuário ainda usa sessão antiga, então próxima requisição já é negada e ato é auditado.
- [ ] Dada única conta admin ativa, quando tentar inativar/remover papel admin, então 409 e nenhuma alteração.

## 6. Testes esperados
Matriz de permissão por papel, IDOR por paciente, grant/revoke DPO e último admin; auditoria de mudança/negação. Lint do backend.

## 7. Definition of Done
- [ ] Guards no servidor e portas reutilizáveis; nenhuma política somente visual.
- [ ] Testes de isolamento e auditoria passam; contrato compartilhado respeitado.
- [ ] Lint passa, sem `tsc`; vínculo clínico específico continua BE-030.

## 8. Suposições e pontos em aberto
Designação formal de quem detém `privacy.dpo` é P-08. Campos clínicos entre especialidades/janelas do vínculo permanecem P-06; o guard deve falhar fechado até existir política aprovada.
