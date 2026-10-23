# FE-005 - Tela de login e desafio MFA

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-004, BE-008
- **Requisitos cobertos:** RF-002, RNF-013

## 1. Objetivo
Conectar a tela de entrada existente à autenticação real e ao segundo fator dos perfis internos, com mensagens seguras e orientação por papel.

## 2. Escopo
- Inclui: identificação/senha, desafio MFA, estados de envio/erro/bloqueio, recuperação e redirecionamento por perfil.
- NÃO inclui: API de login (BE-008), recuperação em si (FE-006) ou dashboard de domínio.

## 3. Contexto necessário
Ler `specs/frontend/design-system.md`, `specs/frontend/screens-map.md` (`/login`), `specs/shared/api-contracts.md` (auth), DRS §3.1.2, `apps/frontend/AGENTS.md` e a página atual `apps/frontend/src/app/page.tsx` antes de editá-la.

## 4. Detalhamento
- Preservar hierarquia útil da página atual: marca, texto introdutório, card de acesso, labels visíveis, senha com mostrar/ocultar, ação Entrar e link Esqueci senha. Remover simulação `setTimeout`/mensagem de autenticação futura e conectar ao serviço FE-004. Tela em pt-BR, responsiva desde 360 px.
- Campo identificação aceita e-mail/CPF; erros de credencial não dizem qual campo falhou. Interno recebe etapa MFA (método P-05), paciente entra diretamente. Estados loading, erro, bloqueio após `auth.failed_login_limit`, conta inativa, senha redefinida e foco/teclado; não mostrar token em tela/URL.
- Após autenticação, navegar ao destino do perfil autorizado; nenhum perfil recebe link de função que não possui.

## 5. Critérios de aceite
- [ ] Dado paciente válido, quando entrar, então chega ao painel permitido; dado interno válido sem MFA, então permanece no desafio sem sessão plena.
- [ ] Dada senha errada, quando enviar, então mensagem genérica não enumera conta/campo.
- [ ] Dado bloqueio após tentativas, quando receber erro, então tela explica próximo passo sem expor dados internos.
- [ ] Dado viewport 360 px/teclado, quando preencher e corrigir erro, então label/foco/ação continuam acessíveis.

## 6. Testes esperados
Fluxos com backend/mock contratual: paciente, interno MFA, erro genérico, bloqueio, loading e navegação teclado; lint.

## 7. Definition of Done
- [ ] P-05 resolvido; tela sem simulação de sucesso e sem segredo persistido.
- [ ] Estados/contrato/tema/a11y verificados; lint passa, sem `tsc`.
- [ ] Nenhuma tela além de login/MFA alterada funcionalmente.

## 8. Suposições e pontos em aberto
Método/canal MFA e duração do bloqueio permanecem P-05. A rota `/login` é proposta técnica do mapa; `/` pode redirecionar quando implementado.
