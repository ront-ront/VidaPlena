# FE-009 - Administração de contas, perfis e convites

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-003, FE-004, BE-005, BE-007
- **Requisitos cobertos:** RF-029, RNF-012

## 1. Objetivo
Permitir que admin/gestor provisionem usuários internos dentro das próprias permissões e acompanhem status, convites e designação DPO.

## 2. Escopo
- Inclui: lista com perfil/status/último acesso, convite, edição de papel permitida, inativação e grant `privacy.dpo` por admin.
- NÃO inclui: consulta de auditoria (FE-037), dados clínicos, cadastros de profissionais/especialidades como domínio (FE-010).

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (`/admin/usuarios`), `specs/frontend/design-system.md`, `specs/shared/access-policy.md`, `specs/shared/api-contracts.md` (admin), DRS §3.5.2 e Q-05/Q-20.

## 4. Detalhamento
- Layout proposto Q-14: cabeçalho com ação Convidar, busca/filtros, tabela de usuários com perfil/status/último acesso, painel/dialog para convite/edição e confirmação de inativação. Gestor só vê controles de recepção/profissional; admin gere gestor e DPO. Sem DPO designado, mostrar alerta e fila no admin.
- Mensagens distinguem convite enviado, expirado, conta bloqueada/inativa e conflito do último admin. Ações têm feedback de loading/erro/sucesso; alteração de papel imediatamente reflete navegação. Sem botão de excluir conta.
- Em mobile/tablet, tabela tem vista legível/scroll próprio, controles por teclado e texto além de badge colorido; jamais mostrar conteúdo clínico.

## 5. Critérios de aceite
- [ ] Dado gestor, quando abrir, então não há controle para criar admin/gestor ou atribuir DPO; API também nega tentativa forçada.
- [ ] Dado admin, quando atribuir/revogar DPO, então estado/alerta atualizam e evento é auditado.
- [ ] Dada última conta admin, quando tentar inativar, então UI mostra conflito e conta permanece ativa.
- [ ] Dada conta inativada, quando listar, então histórico/status permanecem; não existe exclusão física na UI.

## 6. Testes esperados
Fluxos admin/gestor, convite, DPO, último admin, inativação e estados; teclado e lint.

## 7. Definition of Done
- [ ] Controles por permissão alinhados a API, sem leitura clínica.
- [ ] Layout/estados/contrato verificados; lint passa, sem `tsc`.
- [ ] Catálogo de profissionais fica para FE-010.

## 8. Suposições e pontos em aberto
Designação formal do DPO é P-08. A rota e composição são propostas técnicas Q-14, não layout específico do documento original.
