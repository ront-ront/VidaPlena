# BE-009 - Recuperação de senha e confirmação de contato

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-006, BE-008
- **Requisitos cobertos:** RF-003, RF-005, RNF-013

## 1. Objetivo
Restabelecer acesso sem enumerar contas e confirmar e-mail/telefone novos antes de usá-los em notificações.

## 2. Escopo
- Inclui: solicitação/conclusão de reset, token temporário único, política de senha/histórico, rate limit, revogação de sessões e verificação de contato.
- NÃO inclui: telas (FE-006/008), alteração de CPF/data de nascimento, provedor real de e-mail.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md` (auth e conta), `specs/shared/parameters.md` (auth), `specs/shared/data-model.md`, DRS §§3.1.3/3.1.5, Q-15 e P-05.

## 4. Detalhamento
- `recovery/request` devolve sempre 202 genérico. Se conta existe, enviar link por EmailSender; hash do token no banco, TTL `auth.reset_link_minutes`, uso único; limitar por `auth.reset_requests_per_hour`. `complete` valida `auth.password_min_length`, lista de senhas comuns, histórico de `auth.password_history_count`, atualiza bcrypt e encerra todas as sessões.
- PATCH de contato cria pendência e link pelo **novo** canal; antigo continua oficial até confirmação (`auth.email_verify_link_hours`). Registro de CPF/data só pela clínica em outro fluxo posterior com responsável auditado. AuditEvent registra solicitação/conclusão sem senha/token.

## 5. Critérios de aceite
- [ ] Dado e-mail/CPF inexistente ou existente, quando solicitar reset, então status/mensagem pública são indistinguíveis.
- [ ] Dado token expirado/usado, quando concluir reset, então 410, sem alterar senha.
- [ ] Dada senha anterior dentro de `auth.password_history_count`, quando redefinir, então 400 e nova senha exigida.
- [ ] Dado reset concluído, quando usar qualquer sessão antiga, então 401.
- [ ] Dado contato novo não confirmado, quando notificar, então sistema usa o contato antigo; após confirmação usa o novo.

## 6. Testes esperados
Unitários de política de senha e relógio; integração de enumeração, rate limit, token único/expiração, revogação e confirmação de contato. Lint.

## 7. Definition of Done
- [ ] `auth.password_history_count` definido antes de marcar implementável; sem segredo em logs.
- [ ] Endpoints/erros e auditoria respeitam contrato; testes/lint passam, sem `tsc`.
- [ ] Alteração de dado legal fora do escopo.

## 8. Suposições e pontos em aberto
Quantidade de senhas anteriores é P-05. Verificação de telefone requer canal efetivo; V1 só dispõe de e-mail/portal, então mudança de telefone por prova no novo canal deve ficar pendente ou usar procedimento presencial aprovado, sem fingir SMS disponível.
