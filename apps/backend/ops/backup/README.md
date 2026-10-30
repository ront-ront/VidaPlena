# Backup e restauração M0

## Estratégia

pgBackRest 2.58 (imagem local baseada em PostgreSQL 17) guarda backup físico completo e incremental e recebe WAL continuamente pelo `archive_command`. O repositório PostgreSQL usa criptografia client side com chave `BACKUP_REPO_PASSPHRASE`. `archive_timeout` de ensaio é `ops.wal_archive_timeout_seconds`; o atraso real de arquivamento deve ser monitorado para verificar `ops.rpo_minutes_max`.

`backup:cycle full|incremental` executa `pgbackrest check`, backup físico e snapshot dos arquivos. Objetos de `FileStorage` são cifrados novamente com `BACKUP_FILE_KEY`, diferente de `FILE_ENCRYPTION_KEY`; snapshots completos e incrementais compartilham objetos por SHA-256, mas cada manifesto representa o inventário completo. O manifesto e o ledger de revogação também são cifrados. Não há expurgo automático de snapshots ou objetos nesta V1 M0. Falha encerra com código não zero e emite JSON `ops.alert/backup_failed` para o coletor de logs operacionais.

`cron.example` é a agenda operacional proposta. Instalar com ambiente/segredos protegidos no host executor e ajustar ao fuso/horário da clínica. O exemplo executa ciclo completo diário e incremental de arquivos a cada `backup.file_cycle_minutes`; WAL arquiva continuamente, independente do cron. `run-cycle.sh` serializa ciclos por lock. A execução real do agendador e o roteamento do alerta devem ser comprovados em P-07.

No alvo produtivo, configurar pgBackRest no host/operador do PostgreSQL com `PGBACKREST_STANZA`, `PGBACKREST_PG1_PATH`, repositório secundário brasileiro (`PGBACKREST_REPO1_PATH` ou opções de S3), `PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc` e `PGBACKREST_REPO1_CIPHER_PASS` obtida de cofre. Configurar PostgreSQL com `archive_mode=on`, `archive_command='pgbackrest --stanza=vidaplena archive-push %p'` e `archive_timeout` conforme `ops.wal_archive_timeout_seconds`; executar `stanza-create` e `check` antes do agendador. O `compose.test.yaml` configura esses campos só para o ensaio local; sua senha `BACKUP_REPO_PASSPHRASE` é injetada como `PGBACKREST_REPO1_CIPHER_PASS` no contêiner. O backup físico cobre o cluster PostgreSQL, não só uma tabela/base da aplicação.

## Ensaio local isolado

1. Criar `ops/backup/.env.local` a partir de `.env.example`, preenchendo duas chaves aleatórias distintas e caminhos privados. Nunca versionar esse arquivo. Exemplo de geração: `openssl rand -base64 48` para a senha do repositório; `openssl rand -base64 32` para a chave de arquivos. Definir também `FILE_ENCRYPTION_KEY` com chave diferente quando executar a API.
2. Dentro desta pasta, `docker compose --env-file .env.local -f compose.test.yaml up -d --build postgres`. A porta 15437 e os volumes `backup_*` são isolados. Inicializar com `docker exec -u postgres vidaplena-backup-test pgbackrest --stanza=vidaplena stanza-create` e verificar com o mesmo prefixo mais `check`.
3. Executar `docker exec -u postgres vidaplena-backup-test pgbackrest --stanza=vidaplena --type=full backup`. Depois de inserir dados fictícios, executar `backup:cycle incremental` no workspace backend com o ambiente carregado. `PGBACKREST_BIN=.../pgbackrest-in-docker.sh` permite o ensaio local sem instalar pgBackRest no host. Nunca apontar para banco real.
4. Forçar `SELECT pg_switch_wal()` em **transação posterior** à escrita de teste e conferir `pg_stat_archiver.last_archived_wal`. Para restaurar banco, iniciar o serviço `restore` do Compose no perfil `restore`, criar diretório vazio pertencente a postgres e executar `pgbackrest --stanza=vidaplena --pg1-path=<diretório> restore` no contêiner isolado. Iniciar PostgreSQL restaurado em outra porta e comparar contagens, marcadores e `AuditEvent`/`ConsentEvent`; registrar tempos de início/fim e última escrita recuperada.
5. Restaurar arquivos com `yarn workspace vida-plena-backend backup:files restore <repo> <diretório-vazio>`. Comparar SHA-256 dos objetos cifrados de origem e restauração; em dados reais, conferir cada `FileObject` com `LocalEncryptedFileStorage.read` e SHA-256 de plaintext contra o registro. Nunca substituir o storage ativo diretamente.

O ledger `revoked-ledger.enc` acompanha o repositório de arquivos fora dos snapshots históricos. `backup:files revoke <repo> recording <storageKey>` marca um objeto revogado, e toda restauração posterior omite o conteúdo mesmo de snapshots antigos. BE-047 deve integrar esse comando/porta ao fluxo de revogação e replicar o ledger fora do domínio de falha do repositório. O prazo de exclusão física e rotação de backups é P-03; sem essa integração, não declarar gravações recuperáveis com segurança em produção.

## Critérios e limites

- Registrar para cada ensaio: ambiente, versão de PostgreSQL/pgBackRest, hashes/contagens de DB e arquivos, última escrita, último WAL arquivado, início/fim da restauração, RPO/RTO observados frente a `ops.rpo_minutes_max` e `ops.rto_hours_max`.
- Fazer simulação ao menos semestralmente. Produção exige repositório cifrado em localidade distinta da primária, ambas no Brasil, credenciais separadas e monitor externo; o Compose de teste mantém volumes no mesmo host e não comprova RNF-024/RNF-007 de produção.
- Não executar limpeza de prontuário ou consentimento pela rotina de backup. `privacy.clinical_retention_years` é mínimo dos dados clínicos ativos; a política final de retenção e descarte é P-01. Backups antigos podem conter gravação revogada, então a restauração deve aplicar o ledger; rotação definitiva depende de P-03.

Referência operacional: [guia oficial pgBackRest](https://pgbackrest.org/user-guide.html) e [referência de comandos](https://pgbackrest.org/command.html).
