# BE-007 - Seed do admin e convite de usuários internos

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada localmente
- **Depende de:** BE-005, BE-006
- **Requisitos cobertos:** RF-029, RNF-013

## 1. Objetivo
Criar o primeiro administrador de modo controlado e permitir provisionamento de contas internas por convite de e-mail, sem senha provisória em claro.

## 2. Escopo
- Inclui: seed idempotente inicial, criação/desativação de gestor/recepção/profissional, token de convite de uso único, definição de senha e revisão de contas inativas.
- NÃO inclui: login/MFA (BE-008), tela administrativa (FE-009), cadastro de paciente (BE-010).

## 3. Contexto necessário
Ler `specs/shared/data-model.md` (`User`, `Invitation`), `specs/shared/access-policy.md`, `specs/shared/api-contracts.md` (admin/invite), `specs/shared/parameters.md` (`auth.invite_link_hours`), Q-05/Q-15.

## 4. Detalhamento
- Seed inicial cria um admin somente quando não existe nenhum, com segredo fornecido pelo operador fora do repositório; seed repetido não duplica nem redefine senha silenciosamente. Não incluir credencial padrão em arquivo/versionamento.
- Admin convida gestor/recepção/profissional; gestor somente recepção/profissional. Conta inicia `invited`, recebe link pelo EmailSender, ativa ao definir senha válida. Token persistido apenas como hash, expira/consome; reenviar revoga anterior. Contas são inativadas, nunca excluídas; sessão ativa é revogada.
- Aplicar proteção do último admin de BE-005 e auditar criação, convite, ativação, papel e inativação. Job usa `account.inactivity_review_days` para marcar conta sem login para revisão e avisar admin, sem desativação ou exclusão automática. Endpoints conforme `api-contracts.md`.

## 5. Critérios de aceite
- [x] Dado banco sem admin, quando executar seed duas vezes, então existe exatamente um admin e nenhum segredo aparece em log/código.
- [x] Dado gestor, quando convidar recepção/profissional, então 201; quando tentar convidar admin/gestor, então 403.
- [x] Dado convite expirado/usado, quando definir senha, então 410 e conta não é ativada.
- [x] Dada conta interna inativada, quando usar sessão anterior, então acesso é negado e histórico permanece.
- [x] Dada conta sem login além de `account.inactivity_review_days`, quando a rotina rodar, então admin recebe alerta de revisão e a conta não é excluída/desativada automaticamente.

## 6. Testes esperados
Integração de seed idempotente, matriz de convites, expiração/uso único e desativação com sessão; auditoria. Lint do backend.

## 7. Definition of Done
- [x] Não existe senha padrão no repositório ou resposta de API.
- [x] Fluxo de convite e inativação respeita RBAC e contrato.
- [x] Testes/lint passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Canal de e-mail real é futuro; caixa dev de BE-006 serve demonstração. Procedimento seguro de entrega do segredo do seed ao operador será documentado na spec, sem valor fixo.

## Evidência de implementação

Seed idempotente e convites transacionais, hash bcrypt, tokens opacos/cifrados só na fila, uso único mesmo sob concorrência, reenvio e revisão sem exclusão. Suite Node 10/10 e integração PostgreSQL 10/10 aprovadas; lint aprovado. Teste de seed cria banco temporário próprio, aplica migrations e remove somente esse banco. Comandos documentados no README backend; runtime HTTP/autenticação conectados em BE-008.
