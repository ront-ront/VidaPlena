import { spawn } from 'node:child_process'
import { z } from 'zod'
import { backupKey, snapshotFiles } from './file-snapshots'

const cycleEnv = z.object({
  FILE_STORAGE_PATH: z.string().min(1),
  BACKUP_FILE_REPO_PATH: z.string().min(1),
  PGBACKREST_BIN: z.string().min(1).default('pgbackrest'),
  PGBACKREST_STANZA: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,50}$/)
    .default('vidaplena'),
})

async function run(bin: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      shell: false,
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Comando operacional falhou.')),
    )
  })
}

export async function backupCycle(
  mode: 'full' | 'incremental',
  env: NodeJS.ProcessEnv = process.env,
) {
  const settings = cycleEnv.parse(env)
  const key = backupKey(env)
  await run(settings.PGBACKREST_BIN, [
    `--stanza=${settings.PGBACKREST_STANZA}`,
    'check',
  ])
  await run(settings.PGBACKREST_BIN, [
    `--stanza=${settings.PGBACKREST_STANZA}`,
    `--type=${mode === 'full' ? 'full' : 'incr'}`,
    'backup',
  ])
  return snapshotFiles(
    settings.FILE_STORAGE_PATH,
    settings.BACKUP_FILE_REPO_PATH,
    key,
    mode,
  )
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const mode = process.argv[2]
  if (mode !== 'full' && mode !== 'incremental') {
    process.stderr.write(
      `${JSON.stringify({ event: 'ops.alert', kind: 'backup_failed', reasonCode: 'invalid_mode' })}\n`,
    )
    process.exitCode = 1
  } else {
    backupCycle(mode).then(
      (result) => {
        process.stdout.write(
          `${JSON.stringify({ event: 'backup.cycle_succeeded', mode, snapshotId: result.id, fileCount: result.count })}\n`,
        )
      },
      () => {
        process.stderr.write(
          `${JSON.stringify({ event: 'ops.alert', kind: 'backup_failed', mode })}\n`,
        )
        process.exitCode = 1
      },
    )
  }
}
