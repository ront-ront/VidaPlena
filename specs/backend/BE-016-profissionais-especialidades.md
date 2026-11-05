# BE-016 - Profissionais, especialidades e duração padrão

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** base implementada localmente; critérios de consulta futura aguardam BE-021/022/023
- **Depende de:** BE-005, BE-007
- **Requisitos cobertos:** RF-028, RN-002

## 1. Objetivo
Manter o catálogo de profissionais e especialidades que alimenta a grade e a busca de horários, com duração por primeira consulta e retorno.

## 2. Escopo
- Inclui: migrations `Specialty`/`ProfessionalProfile`/vínculo, catálogo de leitura, criação/edição/inativação e validação de registro profissional.
- NÃO inclui: salas (BE-017), grade (BE-018), convite/identidade (BE-007) nem remanejamento automático de consultas.

## 3. Contexto necessário
Ler `specs/00-constitution.md`, `specs/shared/data-model.md#m1`, `specs/shared/api-contracts.md#m1`, `specs/shared/access-policy.md`, DRS §3.5.1 e RN-002/Q-07.

## 4. Detalhamento
- Gestor/admin vinculam conta interna profissional a registro de conselho (tipo, número, UF), especialidades e modalidades. Unicidade do registro por conselho/UF/número é constraint; validação de formato não equivale à consulta de conselho externo, que não foi prevista.
- Duração positiva por especialidade e tipo `first/return`; mudança vale para novos agendamentos, sem reescrever duração já confirmada. Modalidade remota só aparece onde habilitada; catálogo público não expõe contato/registro privado.
- Inativação preserva referências históricas e exige lista de consultas futuras afetadas e decisão explícita por RF-009/010; nenhuma rota DELETE. Repository Prisma na infraestrutura e autorização/auditoria nos use cases.

## 5. Critérios de aceite
- [x] Dado registro profissional duplicado ou formato inválido, quando cadastrar, então 409/400 e nenhum perfil adicional persiste.
- [ ] Dada duração alterada, quando confirmar consulta nova, então usa a versão vigente; consulta anterior mantém duração/horário registrados.
- [x] Dada especialidade sem modalidade remota, quando consultar catálogo, então remoto não é ofertado.
- [ ] Dado profissional com consultas futuras, quando inativar sem resolução, então 409 lista impacto autorizado e status permanece ativo; com resolução registrada, histórico permanece referenciável.

## 6. Testes esperados
Integração de unicidade, modalidades, duração imutável em consulta existente, RBAC, inativação com agenda futura e auditoria; lint backend.

## 7. Definition of Done
- [ ] Migration/portas/adapters do catálogo, sem regra em controller; contrato compartilhado respeitado.
- [ ] Testes pertinentes e lint passam; nenhuma exclusão física nem `tsc`.

## 8. Suposições e pontos em aberto
Consulta automática ao conselho e lista real das oito especialidades não estão documentadas; não criar integração nem catálogo fictício obrigatório. A resolução da agenda futura usa BE-022/023 após essas specs existirem.

## Evidência local — 04/11/2026

Migration `202611040016_catalog`, portas/use case/adapter Prisma, schemas Zod compartilhados com OpenAPI e rotas administrativas/públicas integradas ao composition root. Testes HTTP/PostgreSQL 2/2 aprovados: concorrência/duplicidade, duração positiva, versão antiga, PATCH parcial sem reativação implícita, RBAC, conta convidada versus ativa, conselho, modalidades, projeção sem conselho/contato e bloqueio de DELETE. Lint backend aprovado em 123 arquivos. P-22 documenta os detalhes técnicos. O teste de duração preservada em consulta e a guarda real de impacto permanecem pendentes até a criação de `Appointment` em BE-021; não estão comprovados por esses dois testes.
