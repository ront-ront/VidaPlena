# FE-006 - Telas de convite e recuperação de acesso

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-004, BE-007, BE-009
- **Requisitos cobertos:** RF-003, RF-029

## 1. Objetivo
Permitir definir senha de conta convidada e recuperar acesso por link único, sem confirmar a existência de contas a terceiros.

## 2. Escopo
- Inclui: `/convite`, `/recuperar-acesso`, `/redefinir-senha`, estados enviado/expirado/usado/sucesso e política de senha clara.
- NÃO inclui: geração de token/e-mail, login ou confirmação de contato (FE-008).

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (rotas públicas), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md` (auth), `specs/shared/parameters.md` (auth), DRS §3.1.3 e Q-05/Q-15.

## 4. Detalhamento
- Solicitação pede e-mail/CPF e sempre mostra mesma mensagem de envio. Link válido apresenta senha/confirmar, ajuda para `auth.password_min_length` e lista de senhas comuns; backend valida de novo. Após sucesso, indicar login; não logar automaticamente por token de recuperação.
- Convite mostra papel/identidade mínima, prazo `auth.invite_link_hours`, formulário de senha; token expirado/usado oferece novo convite via administrador, sem revelar segredos. Loading, erros campo a campo, foco/teclado e 360 px; não guardar token em localStorage.

## 5. Critérios de aceite
- [ ] Dado identificador existente/inexistente, quando pedir recuperação, então texto/status público são iguais.
- [ ] Dado link usado/expirado, quando abrir, então ação não altera senha e há caminho de nova solicitação.
- [ ] Dada senha inválida, quando enviar, então campo mostra regra/erro sem limpar outros dados úteis.
- [ ] Dado convite válido, quando definir senha, então conta ativa e usuário recebe caminho de login.

## 6. Testes esperados
Fluxo com mock contratual: enumeração, token inválido, senha divergente, convite e sucesso; teclado/viewport; lint.

## 7. Definition of Done
- [ ] Links/tokens não persistidos no browser após uso; mensagens seguras.
- [ ] Estados e contrato verificados; lint passa, sem `tsc`.
- [ ] Fluxo de login continua FE-005.

## 8. Suposições e pontos em aberto
Contagem de senhas anteriores depende P-05; UI pode explicar a regra somente após decisão do parâmetro.
