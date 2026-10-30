import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { backupCycle } from '../ops/backup/backup-cycle'
import {
  restoreFiles,
  revokeFromRestores,
  snapshotFiles,
} from '../ops/backup/file-snapshots'

test('snapshot completo/incremental cifra arquivos, restaura e suprime revogado mesmo em versão antiga', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vp-backup-files-'))
  const source = join(root, 'source')
  const repo = join(root, 'repo')
  const restored = join(root, 'restored')
  const oldRestored = join(root, 'old-restored')
  const key = randomBytes(32)
  const a = randomUUID()
  const b = randomUUID()
  try {
    await mkdir(join(source, 'attachment'), { recursive: true })
    await writeFile(join(source, 'attachment', a), Buffer.alloc(32, 0x41))
    const full = await snapshotFiles(source, repo, key, 'full')
    assert.equal(full.count, 1)
    await writeFile(join(source, 'attachment', b), Buffer.alloc(32, 0x42))
    const incremental = await snapshotFiles(source, repo, key, 'incremental')
    assert.equal(incremental.count, 2)
    assert.equal((await readdir(join(repo, 'objects'))).length, 2)
    const objectBytes = await readFile(
      join(repo, 'objects', (await readdir(join(repo, 'objects')))[0]),
    )
    assert.equal(objectBytes.includes(Buffer.alloc(32, 0x41)), false)
    assert.equal(objectBytes.includes(Buffer.alloc(32, 0x42)), false)
    await revokeFromRestores(repo, key, 'attachment', a)
    const restoredResult = await restoreFiles(repo, restored, key)
    assert.equal(restoredResult.restored, 1)
    assert.equal(restoredResult.suppressed, 1)
    assert.deepEqual(await readdir(join(restored, 'attachment')), [b])
    const old = await restoreFiles(repo, oldRestored, key, full.id)
    assert.equal(old.restored, 0)
    assert.equal(old.suppressed, 1)
    await assert.rejects(
      restoreFiles(repo, join(root, 'wrong-key'), randomBytes(32)),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('objeto cifrado adulterado falha na restauração antes de entregar conteúdo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vp-backup-tamper-'))
  const source = join(root, 'source')
  const repo = join(root, 'repo')
  const key = randomBytes(32)
  try {
    await mkdir(join(source, 'result'), { recursive: true })
    await writeFile(
      join(source, 'result', randomUUID()),
      Buffer.alloc(32, 0x43),
    )
    await snapshotFiles(source, repo, key, 'full')
    const object = join(
      repo,
      'objects',
      (await readdir(join(repo, 'objects')))[0],
    )
    const bytes = await readFile(object)
    bytes[bytes.length - 17] ^= 1
    await writeFile(object, bytes)
    await assert.rejects(restoreFiles(repo, join(root, 'restored'), key))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ciclo coordena check, backup incremental e snapshot; falha não publica novo snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vp-backup-cycle-'))
  const source = join(root, 'source')
  const repo = join(root, 'repo')
  const bin = join(root, 'fake-pgbackrest.sh')
  const calls = join(root, 'calls.log')
  try {
    await mkdir(join(source, 'attachment'), { recursive: true })
    await writeFile(
      join(source, 'attachment', randomUUID()),
      Buffer.alloc(32, 0x44),
    )
    await writeFile(bin, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\n`, {
      mode: 0o700,
    })
    const env = {
      FILE_STORAGE_PATH: source,
      BACKUP_FILE_REPO_PATH: repo,
      BACKUP_FILE_KEY: randomBytes(32).toString('base64'),
      PGBACKREST_BIN: bin,
      PGBACKREST_STANZA: 'vidaplena',
    }
    const result = await backupCycle('incremental', env)
    assert.equal(result.count, 1)
    const lines = (await readFile(calls, 'utf8')).trim().split('\n')
    assert.ok(lines[0].endsWith('check'))
    assert.ok(lines[1].includes('--type=incr backup'))
    const before = (await readdir(join(repo, 'snapshots'))).length
    await writeFile(bin, '#!/bin/sh\nexit 4\n', { mode: 0o700 })
    await assert.rejects(backupCycle('incremental', env))
    assert.equal((await readdir(join(repo, 'snapshots'))).length, before)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
