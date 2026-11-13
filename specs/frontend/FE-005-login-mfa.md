# FE-005 - Tela de login e desafio MFA

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** implementada localmente; revisão manual com leitor de tela pendente
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
- Ajuste solicitado pelo usuário em 13/11/2026: no primeiro cadastro TOTP, mostrar QR code gerado localmente a partir de `otpauthUri` de `/auth/mfa/enroll`, junto à chave manual já disponível para copiar. Manter margem de leitura e contraste do QR em ambos os temas, texto alternativo e layout desde 360 px. Não enviar URI/segredo a serviço externo nem persistir em storage; login com MFA já cadastrado não exibe QR/chave.
- Após autenticação, navegar ao destino do perfil autorizado; nenhum perfil recebe link de função que não possui.

## 5. Critérios de aceite
- [ ] Dado paciente válido, quando entrar, então chega ao painel permitido; dado interno válido sem MFA, então permanece no desafio sem sessão plena.
- [ ] Dada senha errada, quando enviar, então mensagem genérica não enumera conta/campo.
- [ ] Dado bloqueio após tentativas, quando receber erro, então tela explica próximo passo sem expor dados internos.
- [ ] Dado viewport 360 px/teclado, quando preencher e corrigir erro, então label/foco/ação continuam acessíveis.
- [x] Dado primeiro cadastro MFA, quando escanear o QR exibido, então ele contém exatamente a URI retornada pela API e a chave manual permanece visível; ao voltar/recarregar, ambos deixam de aparecer.

## 6. Testes esperados
Fluxos com backend/mock contratual: paciente, interno MFA, erro genérico, bloqueio, loading e navegação teclado; lint.

## 7. Definition of Done
- [ ] P-05 resolvido; tela sem simulação de sucesso e sem segredo persistido.
- [ ] Estados/contrato/tema/a11y verificados; lint passa, sem `tsc`.
- [ ] Nenhuma tela além de login/MFA alterada funcionalmente.

## 8. Suposições e pontos em aberto
Método/canal MFA e duração do bloqueio permanecem P-05. A rota `/login` é proposta técnica do mapa; `/` pode redirecionar quando implementado.

## Evidência de implementação

`/` redireciona a `/login`; formulário preserva marca/hierarquia, aceita e-mail/CPF, chama API real e mostra desafio TOTP com chave de primeiro acesso apenas em memória. Erros e bloqueio usam mensagens seguras; token não aparece em UI/URL. Firefox headless com backend real confirmou matrícula TOTP do admin e da recepção, código válido, entrada de paciente sem MFA e redirecionamento por papel para páginas M0 em 360 px. Lint/build passaram; revisão manual com leitor de tela permanece para homologação.

### QR code de cadastro TOTP — 13/11/2026

Ajuste solicitado pelo usuário, restrito à FE-005: `QRCodeSVG` de `qrcode.react` 4.2.0 renderiza localmente a `otpauthUri` já contratada, com margem de quatro módulos, rótulo acessível e fundo branco preservado nos temas claro/escuro. Chave manual continua visível/selecionável. QR/chave só aparecem quando `enrollmentRequired=true` e enrollment foi recebido; não há serviço externo, novo endpoint nem persistência de segredo.

**4/4 testes Firefox com API simulada** aprovados: decodificação dos pixels do QR por `jsqr` (dependência só de desenvolvimento) corresponde exatamente à URI da API; chave permanece após erro de verificação; voltar/recarregar remove cadastro da tela; storage/requisições não recebem segredo; MFA já cadastrado não consulta enrollment nem mostra QR/chave; 360 px/teclado e decodificação nos dois temas. Captura mobile escura inspecionada. **Lint monorepo aprovado, backend220/front87 arquivos**. Logs `/tmp/vidaplena-mfa-qr-{browser-final,lint-final}.log`. Build não foi repetido nesta alteração; revisão manual com leitor de tela permanece pendente. Detalhes de ambiente em `_work/08-login-mfa-qr.md`. M1 permanece pausada após FE-017, sem novos commits.
