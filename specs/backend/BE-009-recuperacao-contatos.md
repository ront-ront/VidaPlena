# BE-009 - Recuperação de senha e confirmação de contato

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada localmente (envio a paciente revalida consentimento em BE-011; provedor produtivo pendente)
- **Depende de:** BE-006, BE-008
- **Requisitos cobertos:** RF-003, RF-005, RNF-013

## 1. Objetivo
Restabelecer acesso sem enumerar contas e confirmar e-mail/telefone novos antes de usá-los em notificações.

## 2. Escopo
- Inclui: solicitação/inspeção sem consumo/conclusão de reset, token temporário único, política de senha/histórico, rate limit, revogação de sessões e verificação de contato.
- NÃO inclui: telas (FE-006/008), alteração de CPF/data de nascimento, provedor real de e-mail.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md` (auth e conta), `specs/shared/parameters.md` (auth), `specs/shared/data-model.md`, DRS §§3.1.3/3.1.5, Q-15 e P-05.

## 4. Detalhamento
- `recovery/request` devolve sempre 202 genérico. Se conta existe, enviar link por EmailSender; hash do token no banco, TTL `auth.reset_link_minutes`, uso único; limitar por `auth.reset_requests_per_hour`. `complete` valida `auth.password_min_length`, lista de senhas comuns, histórico de `auth.password_history_count`, atualiza bcrypt e encerra todas as sessões.
- `recovery/inspect` retorna somente validade, sem identidade ou dado de conta, não consome o token e não é cacheável. Token inexistente/usado/expirado ou conta inativa produzem o mesmo 410; FE-006 precisa desse estado ao abrir o link (P-16).
- PATCH de contato cria pendência e link pelo **novo** canal; antigo continua oficial até confirmação (`auth.email_verify_link_hours`). Registro de CPF/data só pela clínica em outro fluxo posterior com responsável auditado. AuditEvent registra solicitação/conclusão sem senha/token.

## 5. Critérios de aceite
- [x] Dado e-mail/CPF inexistente ou existente, quando solicitar reset, então status/mensagem pública são indistinguíveis.
- [x] Dado token expirado/usado, quando concluir reset, então 410, sem alterar senha.
- [x] Dado token válido, quando inspecionar e depois concluir reset, então a inspeção não o consome; dado token expirado/usado/inexistente, quando inspecionar, então 410 genérico.
- [x] Dada senha anterior dentro de `auth.password_history_count`, quando redefinir, então 400 e nova senha exigida.
- [x] Dado reset concluído, quando usar qualquer sessão antiga, então 401.
- [x] Dado contato novo não confirmado, quando notificar, então sistema usa o contato antigo; após confirmação usa o novo.

## 6. Testes esperados
Unitários de política de senha e relógio; integração de enumeração, rate limit, token único/expiração, revogação e confirmação de contato. Lint.

## 7. Definition of Done
- [x] `auth.password_history_count` definido antes de marcar implementável; sem segredo em logs.
- [x] Endpoints/erros e auditoria respeitam contrato; testes/lint passam, sem `tsc`.
- [x] Alteração de dado legal fora do escopo.

## 8. Suposições e pontos em aberto
Quantidade de senhas anteriores é P-05. Verificação de telefone requer canal efetivo; V1 só dispõe de e-mail/portal, então mudança de telefone por prova no novo canal deve ficar pendente ou usar procedimento presencial aprovado, sem fingir SMS disponível.

## Evidência adicional P-16

`POST /v1/auth/recovery/inspect` retorna somente `{status:"valid"}` ou 410 genérico, com `Cache-Control: no-store`; o token é consultado por hash e não é consumido. Integração PostgreSQL isolada aprovou inspeção válida, usada, expirada e desconhecida (3 testes do arquivo de recuperação); lint backend e OpenAPI Vitest passaram em 01/11/2026.
