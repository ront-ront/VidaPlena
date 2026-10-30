# Backend VidaPlena

Execute da raiz: `yarn workspace vida-plena-backend dev` (watch), `start`
(sem watch), `test` (Node test runner + tsx, testes funcionais) e `lint`
(Biome, única verificação estática). Não utilizar `tsc` para testes.

Copie `.env.example` para `.env` dentro desta aplicação. Preencha `JWT_SECRET`
com pelo menos 32 bytes e `FILE_ENCRYPTION_KEY` com 32 bytes aleatórios em
base64; mantenha-os fora do Git. O bootstrap recusa valores ausentes sem imprimir
seus conteúdos. `DATABASE_URL` deve apontar para o banco do ambiente.

`APP_ENV`: development/test/staging/production. Homologação e produção têm bancos,
chaves, arquivos e `ENVIRONMENT_ID` próprios (prefixo do ambiente), origens HTTPS
e `DATA_REGION_COUNTRY=BR`. Essa declaração não comprova a localização real da
infraestrutura: RNF-024 exige evidência da implantação. Providers `dev` de assinatura
e malware são recusados em staging/production; `disabled` deixa a capacidade
indisponível até existir adaptador aprovado. CORS recebe origens exatas separadas
por vírgula; não aceita wildcard, path ou credenciais na URL.

Front/API serão servidos no mesmo site. Sessão usa HttpOnly, SameSite=Lax e Secure
em implantação HTTPS, allowlist de Origin e CSRF (BE-008). HTTP local é exceção
de desenvolvimento. `SIGINT`/`SIGTERM` fecham listener, aguardam requisições e
liberam os recursos registrados na composition root; conexões presas são fechadas
após `SHUTDOWN_TIMEOUT_MS`.

Referências: [Express: graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown/)
e [CORS](https://expressjs.com/en/resources/middleware/cors/).

## Banco e testes de integração (BE-002)

`yarn workspace vida-plena-backend db:generate` gera o client Prisma 7.
`db:migrate` aplica migrations versionadas; `db:validate` verifica o schema.
`TEST_DATABASE_URL` deve apontar para banco isolado cujo nome termine em `_test`;
`yarn workspace vida-plena-backend test:integration` executa testes reais de
integridade no PostgreSQL. Nunca apontar a suíte para dados de paciente reais.
O banco de verificação desta tarefa é o container `vidaplena-m0-test`, porta
15436, banco `vidaplena_test`; é separado dos serviços existentes.
Prisma usa `prisma.config.ts`, e o client gerado é ignorado pelo Git/lint.

## Validação do ambiente

`src/shared/config/environment.ts` define um schema [Zod](https://zod.dev/api), com coerção de números, defaults, enums e validações cruzadas por ambiente. `AppConfig` é inferido do schema. Erros externos mostram somente nomes de variáveis; nunca registrar o `ZodError` bruto nem o ambiente. A instalação das dependências atuais requer Node 22 (a dependência transitiva `@prisma/streams-local` recusa Node 20); Node 22.22.0 foi usado para adicionar Zod.

## Notificações M0

`composeNotifications` monta outbox PostgreSQL, dispatcher e worker com encerramento aguardando a entrega em curso. A composição principal será conectada em BE-008 com as rotas autenticadas. `EMAIL_SENDER=dev` escreve mensagens privadas em `EMAIL_MAILBOX_PATH`, sem endpoint estático; staging/production recusam esse adaptador. `disabled` não simula envio de e-mail. Tokens da fila são cifrados e eliminados da outbox após estado terminal; a caixa local contém o link necessário à demonstração e não deve ser publicada nem versionada.

`NOTIFICATION_RETRY_SECONDS`, `NOTIFICATION_MAX_ATTEMPTS`, `NOTIFICATION_POLL_SECONDS` correspondem a `notification.*` em `specs/shared/parameters.md`. Cada retry revalida consentimento/preferências; sem canal externo, mensagem essencial vai ao portal e registra alerta consultável pela recepção. No M0 anterior a BE-011, a política inicial permite somente notificações de identidade para contas internas e bloqueia pacientes. A integração de consentimento em BE-011 usa o lock de destinatário compartilhado com entrega e alteração de preferências. A seleção dos horários de lembretes permanece BE-025/M1.

## Primeiro administrador e contas internas

Com migrations aplicadas, forneça `ADMIN_SEED_EMAIL`, `ADMIN_SEED_NAME` e `ADMIN_SEED_PASSWORD` por ambiente protegido/secret manager. No terminal local, dentro de `apps/backend`, use:

```bash
read -rp 'E-mail do admin: ' ADMIN_SEED_EMAIL
read -rp 'Nome do admin: ' ADMIN_SEED_NAME
read -rsp 'Senha do admin: ' ADMIN_SEED_PASSWORD; printf '\n'
export ADMIN_SEED_EMAIL ADMIN_SEED_NAME ADMIN_SEED_PASSWORD
yarn db:seed
unset ADMIN_SEED_EMAIL ADMIN_SEED_NAME ADMIN_SEED_PASSWORD
```

Não escreva a senha em comando/histórico ou arquivo versionado. A senha deve respeitar `AUTH_PASSWORD_MIN_LENGTH`, ter até 72 bytes e não constar da lista de senhas comuns. O comando identifica variáveis ausentes ou inválidas pelo nome, sem imprimir seus valores. Repetir o seed preserva a conta/senha anterior; inclusive admin histórico inativo impede substituição silenciosa. Não use senha padrão compartilhada.

Convites são criados por admin/gestor conforme seus papéis, persistidos como hash e enviados pela outbox na mesma transação. Reenvio invalida o anterior. `/auth/invitations/inspect` mostra identificação mínima somente com token válido; `/accept` define senha e consome o token, sem login automático. MFA será exigido no primeiro login interno (BE-008).

Execute `yarn workspace vida-plena-backend accounts:review` pelo agendador operacional para marcar até 100 contas por execução sem login além de `ACCOUNT_INACTIVITY_REVIEW_DAYS`; repita enquanto houver lote cheio. A rotina gera alerta para admins e auditoria; nunca exclui/inativa conta. BE-008 deve atualizar `lastLoginAt` e limpar `reviewRequiredAt` no login bem-sucedido. A operação periódica do comando deve ser configurada na implantação.

Senhas usam [bcryptjs](https://github.com/dcodeIO/bcrypt.js) com custo de `AUTH_BCRYPT_ROUNDS`, sem truncamento acima de 72 bytes. A lista bloqueada vem do dicionário versionado [zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/guide/getting-started/); não é enviado nenhum dado de senha a serviços externos. Parâmetros constam em `specs/shared/parameters.md`.

O teste `tests/integration/provisioning.test.ts` exige permissão de criar banco no servidor **de testes**. Ele cria nome aleatório terminado em `_test`, aplica migrations e remove somente o banco criado por ele. Nunca aponta para banco produtivo nem restaura dados reais.

## Observabilidade e backup M0

`/health/live` e `/health/ready` são sondas de processo e PostgreSQL; a segunda usa `OPS_READINESS_TIMEOUT_MS` e não divulga detalhes da dependência. `/v1/admin/ops/metrics` exige admin com MFA e devolve métricas Prometheus. Pino emite logs JSON com requestId, rota template, método, status e duração, sem URL concreta, payload ou cabeçalhos sensíveis. `OPS_SLOW_REQUEST_MS`, `OPS_ALERTS_ENABLED` e `OPS_LOG_LEVEL` ajustam alertas locais; o destino real de coleta e a comprovação do SLA são P-07. Janelas de manutenção são registradas por admin com referência de aviso externo, antecedência e teto mensal configuráveis; ver `specs/_work/05-operational-runbook.md`.

Backup e restauração têm comandos e ensaio isolado em [ops/backup/README.md](ops/backup/README.md). `backup:cycle` coordena pgBackRest e snapshots cifrados de `FileStorage`; `backup:files` restaura em diretório vazio ou marca supressão de objeto revogado. `BACKUP_FILE_KEY` e a passphrase do pgBackRest devem ficar em cofre e ser distintas da chave da aplicação. O ensaio local de 30/10/2026 está em `specs/_work/06-backup-restore-evidence.md`; não substitui repositório secundário brasileiro nem medição operacional.
