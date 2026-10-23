# BE-008 - Login, MFA, sessões e bloqueio por tentativas

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-005, BE-007
- **Requisitos cobertos:** RF-002, RNF-013

## 1. Objetivo
Autenticar os cinco perfis, exigir segundo fator para internos e manter sessões curtas/revogáveis com auditoria de tentativas.

## 2. Escopo
- Inclui: login, desafio MFA, access/refresh rotativo, logout, inatividade, bloqueio temporário e encerramento por alteração de conta.
- NÃO inclui: recuperação (BE-009), telas (FE-005), definição do método MFA ainda pendente P-05.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md` (auth), `specs/shared/data-model.md` (`Session`), `specs/shared/parameters.md` (auth), `specs/shared/access-policy.md`, DRS §§3.1.2/4.4.2 e P-05.

## 4. Detalhamento
- Verificar hash bcrypt e credenciais com resposta genérica. Interno recebe desafio sem sessão plena até MFA; paciente não precisa segundo fator no DRS. Falhas consecutivas até `auth.failed_login_limit` bloqueiam por `auth.lock_minutes`, notificam usuário/admin e auditam. **Método `auth.mfa_method` e duração do bloqueio não têm valor**; a implementação desta spec aguarda decisão P-05.
- Access token vive `auth.access_token_minutes`; refresh hash rotativo dura `auth.refresh_token_days`, reutilização revoga família. Inatividade `auth.internal_idle_minutes`/`auth.patient_idle_minutes` encerra sessão; decisão do usuário substitui 15 min interno do DRS por 30 min. Tokens não vão para `localStorage` nem logs. Cookie/Origin/CSRF seguem contrato de BE-001.
- Alteração de papel/status/consentimento que bloqueie portal invalida próxima autorização. Toda tentativa, sucesso, falha MFA, bloqueio, refresh e logout gera auditoria sem segredo.

## 5. Critérios de aceite
- [ ] Dado interno com senha válida, quando não concluir MFA, então nenhum endpoint protegido é autorizado.
- [ ] Dadas `auth.failed_login_limit` falhas, quando repetir login, então a conta é bloqueada por `auth.lock_minutes` e aviso/auditoria são gerados.
- [ ] Dado refresh usado duas vezes, quando segunda rotação ocorrer, então a família é revogada e 401 retornado.
- [ ] Dada inatividade acima da chave do perfil, quando usar sessão, então 401 e login novo exigido.
- [ ] Dado paciente com senha válida/consentimento ativo, quando logar, então recebe papel/escopo próprios sem acesso a outro paciente.

## 6. Testes esperados
Integração com relógio injetado: login/MFA, falhas, lock, expiração, refresh reuse, idle por perfil, revogação e auditoria; teste de ausência de token em log. Lint do backend.

## 7. Definition of Done
- [ ] P-05 (MFA/lock) resolvido antes de marcar implementável/concluída.
- [ ] Autorização servidor, cookies e CSRF verificados no domínio real.
- [ ] Testes/lint passam, sem `tsc`; RNF-013 desviado registrado na matriz.

## 8. Suposições e pontos em aberto
`auth.mfa_method`, `auth.lock_minutes` e domínio de cookies/Origin/CSRF não estão definidos. Esta spec está pronta para revisão documental, mas não para implementação sem esses valores.
