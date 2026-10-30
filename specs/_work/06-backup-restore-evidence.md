# Evidência local de BE-015 — 30/10/2026

## Ambiente isolado

PostgreSQL 17.11 em `vidaplena-backup-test` na porta 15437, imagem local com pgBackRest 2.58.0; volumes Docker `backup_backup_pgdata` e `backup_backup_repo`. Restaurações em `vidaplena-restore-test` e diretórios separados no contêiner de ensaio. Nenhum dado real de paciente. Repositório cifrado com pgBackRest `aes-256-cbc` e passphrase de ensaio não versionada; arquivos com AES-256-GCM e chave de backup distinta em `.env.local` ignorado pelo Git. Ambos os volumes Docker estão no mesmo host: **não comprovam localidade distinta/nacional em produção**.

## Banco e WAL

1. `pgbackrest stanza-create` e `check` concluíram com código 0. Backup completo `20261030-172011F` e incremental `20261030-172011F_20261030-172045I` aparecem em `pgbackrest info --output=json` sem erro, cifrados; WAL arquivado até segmento `000000010000000000000008` no teste.
2. Tabela fictícia `backup_probe`: linha `(1, after-full)` inserida antes do incremental. Restauração isolada do incremental recuperou a linha 1.
3. Linha `(2, after-incremental-wal)` inserida após o incremental. A primeira tentativa de restaurá-la falhou porque `pg_switch_wal()` ocorreu **na mesma transação** da inserção, antes do commit; esse teste revelou a necessidade de forçar o switch em transação posterior. Após `SELECT pg_switch_wal()` separado, `pg_stat_archiver` confirmou o segmento 8 arquivado. Nova restauração isolada recuperou **as duas linhas**, inclusive a posterior ao incremental.
4. A última restauração física levou cerca de 16,4 s e o start do PostgreSQL cerca de 3,9 s no ambiente local; RTO observado de ordem de 20 s, abaixo de `ops.rto_hours_max`. Perda observada dos dois marcadores arquivados: zero, compatível com `ops.rpo_minutes_max` neste ensaio. Isto não mede indisponibilidade de rede, tráfego real, transferência entre regiões ou recuperação em infraestrutura alvo.

## FileStorage e falha

`backup:cycle incremental` executou check + incremental pgBackRest + snapshot cifrado de um objeto fictício, retornando `snapshotId=1793381285776-2062c535-3273-450f-aed0-e39874733f18` e `fileCount=1`. `backup:files restore` restaurou 1 objeto. SHA-256 de origem e destino: `3b8fbcb29b467aaf38a10c92cedac874fe3e799d5f19b46b0e19eec3c05eb12a`. Com `PGBACKREST_BIN` inválido, o ciclo saiu 1 e emitiu `{"event":"ops.alert","kind":"backup_failed","mode":"incremental"}` sem expor segredo.

Testes Node `tests/backup-files.test.ts`: snapshot completo/incremental, restauração com supressão de conteúdo revogado inclusive snapshot antigo, chave incorreta, adulteração de objeto e falha de ciclo sem publicar snapshot novo — 3/3 aprovados. O ledger de revogação deve ser replicado fora do domínio de falha e integrado ao fluxo de BE-047; sem isso, P-03 permanece aberto. O schema de prontuário e gravação ainda pertence a M2/M3, portanto a retenção RN-012 e a revogação real não foram demonstradas com dados clínicos.

## Próxima evidência exigida para produção

P-07: escolher/localizar repositórios brasileiros distintos, cofre de chaves, agendador, monitor de atraso de WAL, destino de alertas, ensaio semestral com massa e aferição real de RPO/RTO. P-03: política de rotação e ledger de revogação durável para gravações. P-01: retenção final e descarte legal. Não declarar RNF-007/RN-012 homologados com este ensaio local.
