# Ajuste FE-005 — QR code no cadastro MFA

## Pedido e escopo — 13/11/2026

O usuário pediu, antes de retomar M1, QR code para escanear no primeiro cadastro do autenticador, preservando a chave manual disponível para copiar. Ajuste exclusivo da FE-005/RF-002/RNF-013. FE-018/019/020 não iniciadas; objetivo M1 continua pausado após FE-017. Não criar commits, staging ou push.

## Leitura e decisão

Página original `apps/frontend/src/app/login/page.tsx`: **442 linhas lidas integralmente**, em blocos sequenciais 1–200, 201–400 e 401–442. Spec FE-005 original: **43 linhas**, lida da primeira à última; serviços auth40 e AuthProvider98 também lidos integralmente. Guias/contextos: constituição48, overview47, AGENTS frontend76, design system70, mapa60 e guia Next instalado `use-client.md`123 linhas lidos integralmente. Ordem/matriz já consultadas nas etapas anteriores e relidas nas seções correspondentes. Contrato auth confirma `{secret,otpauthUri}` existente, sem mudança de API.

Skill `context7-mcp` consultada; ferramentas Context7 indisponíveis nesta sessão. Documentação oficial de `qrcode.react` (https://github.com/zpao/qrcode.react) e `jsQR` (https://github.com/cozmo/jsQR) consultada como alternativa, além dos guias Next16.3.6 instalados. Versão4.2.0 da biblioteca de renderização aceita React19 conforme metadata do pacote. `jsqr`1.4.0 entra somente como dependência de desenvolvimento para testar leitura real dos pixels, sem scanner no produto.

## Implementação

- QR em SVG local recebe a URI integral da API, com margem de quatro módulos, tamanho responsivo, rótulo acessível e contraste preservado no tema escuro. Não usa serviço remoto nem imagem externa.
- Chave manual e fluxo de confirmação TOTP permanecem. QR só existe no cadastro inicial já autorizado por desafio; MFA cadastrado continua apenas solicitando o código do aplicativo.
- Alterações funcionais limitadas à página login. Manifest/lock registram as duas bibliotecas; testes novos em `apps/frontend/tests/e2e/login-mfa.spec.ts`. Spec/matriz atualizadas.

## Verificação

**4/4 Firefox com APIs simuladas** em `/tmp/vidaplena-mfa-qr-browser-final.log`: URI decodificada idêntica à API, chave manual preservada inclusive após erro, retorno/reload sem cadastro visível, nenhum segredo em storage/requisição, ausência de enrollment/QR para MFA cadastrado, 360 px/teclado e leitura em tema claro/escuro. Primeira bateria3/4 teve seletor de alerta ambíguo com o anunciador do Next; asserção restringida ao alerta de sessão, sem alteração do comportamento de produto. Capturas `/tmp/vidaplena-mfa-qr-{light,dark}.png`; tema escuro inspecionado visualmente.

**Lint monorepo aprovado** em `/tmp/vidaplena-mfa-qr-lint-final.log`: backend220/front87 arquivos. `git diff --check` aprovado. Nenhum comando tsc; build não repetido. Testes não comprovam homologação com aplicativo físico/leitor de tela, nem reexecutam a integração de autenticação do backend já existente.

## Ambiente e instalação

Primeira instalação pelo workspace falhou com ENOSPC ao preencher cache com pacotes/binários de várias plataformas. Limpeza restrita aos diretórios de cache criados por essa tentativa recuperou espaço; nenhum código/dado de usuário removido. Para evitar novo download completo do monorepo, Yarn instalou somente as duas bibliotecas em projeto temporário isolado, sem scripts/opcionais; os pacotes foram disponibilizados em node_modules e suas entradas exatas de lock geradas pelo Yarn incorporadas ao lock do repositório. Nenhum upgrade de dependência preexistente.

Playwright padrão não iniciou porque o servidor de desenvolvimento do usuário já usava `.next/dev`. Esse processo foi preservado. Testes finais usaram configuração temporária `/tmp/vidaplena-mfa-qr-playwright.config.ts` sobre `http://localhost:3000`, navegador/contexto isolados e todas as chamadas `/v1/**` interceptadas com dados fictícios. Não foi alterado o next.config nem o playwright.config do projeto. Para repetir em ambiente sem outro Next ativo: `yarn workspace vida-plena-frontend test:e2e login-mfa.spec.ts`.

Mensagem de commit sugerida (não executada):

```text
feat(auth): adicionar QR code ao cadastro MFA mantendo chave manual

- renderizar URI TOTP localmente no primeiro cadastro do autenticador
- preservar chave manual e orientação de configuração
- validar leitura do QR, privacidade, temas e responsividade com Playwright
- atualizar evidências da FE-005 e rastreabilidade
```
