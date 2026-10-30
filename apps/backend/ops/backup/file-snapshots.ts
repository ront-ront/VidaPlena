import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  access,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'

const categories = ['attachment', 'result', 'recording'] as const
const categorySchema = z.enum(categories)
const keySchema = z.uuid()
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const snapshotIdSchema = z.string().regex(/^\d{13}-[a-f0-9-]{36}$/)
const fileSchema = z.object({
  category: categorySchema,
  key: keySchema,
  sha256: hashSchema,
  size: z.number().int().nonnegative(),
})
const manifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  kind: z.enum(['full', 'incremental']),
  files: z.array(fileSchema),
})
const ledgerSchema = z.object({
  version: z.literal(1),
  revoked: z.array(
    z.string().regex(/^(attachment|result|recording)\/[a-f0-9-]{36}$/),
  ),
})
type BackupFile = z.infer<typeof fileSchema>

const backupSecretSchema = z
  .object({
    BACKUP_FILE_KEY: z.base64().refine((value) => {
      const bytes = Buffer.from(value, 'base64')
      return bytes.length === 32 && bytes.toString('base64') === value
    }),
    FILE_ENCRYPTION_KEY: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.FILE_ENCRYPTION_KEY === value.BACKUP_FILE_KEY)
      context.addIssue({
        code: 'custom',
        path: ['BACKUP_FILE_KEY'],
        message: 'Chave de backup deve ser segregada.',
      })
  })

export function backupKey(env: NodeJS.ProcessEnv) {
  const parsed = backupSecretSchema.safeParse(env)
  if (!parsed.success)
    throw new Error('Configuração de chave de backup inválida.')
  return Buffer.from(parsed.data.BACKUP_FILE_KEY, 'base64')
}

function separate(source: string, destination: string) {
  const a = resolve(source)
  const b = resolve(destination)
  if (a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`))
    throw new Error('Origem e repositório de backup devem ser separados.')
  return { source: a, destination: b }
}

async function sha256(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function sealFile(
  input: string,
  output: string,
  key: Buffer,
  purpose: string,
) {
  const temporary = `${output}.${randomUUID()}.tmp`
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(purpose))
  const outputHandle = await open(temporary, 'wx', 0o600)
  await outputHandle.writeFile(Buffer.concat([Buffer.from('VPB1'), iv]))
  await outputHandle.close()
  const digest = createHash('sha256')
  try {
    await pipeline(
      createReadStream(input),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          digest.update(chunk)
          callback(null, chunk)
        },
      }),
      cipher,
      createWriteStream(temporary, { flags: 'a', mode: 0o600 }),
    )
    const handle = await open(temporary, 'a')
    await handle.writeFile(cipher.getAuthTag())
    await handle.sync()
    await handle.close()
    await rename(temporary, output)
    return digest.digest('hex')
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function openFile(
  input: string,
  output: string,
  key: Buffer,
  purpose: string,
) {
  const bytes = await stat(input)
  if (bytes.size < 32) throw new Error('Backup cifrado inválido.')
  const handle = await open(input, 'r')
  const header = Buffer.alloc(16)
  const tag = Buffer.alloc(16)
  try {
    await handle.read(header, 0, 16, 0)
    await handle.read(tag, 0, 16, bytes.size - 16)
  } finally {
    await handle.close()
  }
  if (header.subarray(0, 4).toString() !== 'VPB1')
    throw new Error('Formato de backup inválido.')
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(4))
  decipher.setAAD(Buffer.from(purpose))
  decipher.setAuthTag(tag)
  const temporary = `${output}.${randomUUID()}.tmp`
  try {
    await pipeline(
      createReadStream(input, { start: 16, end: bytes.size - 17 }),
      decipher,
      createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
    )
    await rename(temporary, output)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function readEncryptedJson(path: string, key: Buffer, purpose: string) {
  const value = await readFile(path)
  if (value.length < 32 || value.subarray(0, 4).toString() !== 'VPB1')
    throw new Error('Manifesto de backup inválido.')
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(4, 16))
  decipher.setAAD(Buffer.from(purpose))
  decipher.setAuthTag(value.subarray(value.length - 16))
  return JSON.parse(
    Buffer.concat([
      decipher.update(value.subarray(16, value.length - 16)),
      decipher.final(),
    ]).toString('utf8'),
  ) as unknown
}

async function writeEncryptedJson(
  value: unknown,
  path: string,
  key: Buffer,
  purpose: string,
) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(purpose))
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ])
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(
      temporary,
      Buffer.concat([Buffer.from('VPB1'), iv, body, cipher.getAuthTag()]),
      { flag: 'wx', mode: 0o600 },
    )
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function latestManifest(repo: string, key: Buffer) {
  const directory = join(repo, 'snapshots')
  const names = (await readdir(directory).catch(() => []))
    .filter((name) => /^\d{13}-[a-f0-9-]{36}\.enc$/.test(name))
    .sort()
  const name = names.at(-1)
  if (!name) throw new Error('Nenhum snapshot disponível.')
  const id = basename(name, '.enc')
  return {
    id,
    manifest: manifestSchema.parse(
      await readEncryptedJson(join(directory, name), key, `manifest:${id}`),
    ),
  }
}

async function ledger(repo: string, key: Buffer) {
  const path = join(repo, 'revoked-ledger.enc')
  try {
    return ledgerSchema.parse(
      await readEncryptedJson(path, key, 'revoked-ledger'),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1 as const, revoked: [] as string[] }
    throw error
  }
}

async function locked<T>(repo: string, run: () => Promise<T>): Promise<T> {
  await mkdir(repo, { recursive: true, mode: 0o700 })
  const lock = join(repo, '.snapshot-lock')
  await mkdir(lock)
  try {
    return await run()
  } finally {
    await rmdir(lock)
  }
}

export async function snapshotFiles(
  source: string,
  repo: string,
  key: Buffer,
  kind: 'full' | 'incremental',
) {
  const paths = separate(source, repo)
  if (!(await lstat(paths.source)).isDirectory())
    throw new Error('Storage de origem inválido.')
  return locked(paths.destination, async () => {
    await mkdir(join(paths.destination, 'objects'), {
      recursive: true,
      mode: 0o700,
    })
    await mkdir(join(paths.destination, 'snapshots'), {
      recursive: true,
      mode: 0o700,
    })
    const files: BackupFile[] = []
    for (const category of categories) {
      const directory = join(paths.source, category)
      const names = await readdir(directory).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [] as string[]
          throw error
        },
      )
      for (const name of names.sort()) {
        if (!keySchema.safeParse(name).success)
          throw new Error('Nome de arquivo inesperado no storage.')
        const path = join(directory, name)
        const before = await lstat(path)
        if (!before.isFile() || before.isSymbolicLink() || before.size < 28)
          throw new Error('Objeto de arquivo incompleto ou inválido.')
        const digest = await sha256(path)
        const object = join(paths.destination, 'objects', `${digest}.enc`)
        try {
          await access(object)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          const copiedDigest = await sealFile(
            path,
            object,
            key,
            `object:${digest}`,
          )
          if (copiedDigest !== digest) {
            await unlink(object)
            throw new Error('Arquivo mudou durante o backup.')
          }
        }
        const after = await lstat(path)
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
          throw new Error('Arquivo mudou durante o backup.')
        files.push({ category, key: name, sha256: digest, size: before.size })
      }
    }
    const id = `${Date.now()}-${randomUUID()}`
    await writeEncryptedJson(
      { version: 1, createdAt: new Date().toISOString(), kind, files },
      join(paths.destination, 'snapshots', `${id}.enc`),
      key,
      `manifest:${id}`,
    )
    return {
      id,
      kind,
      count: files.length,
      createdAt: new Date().toISOString(),
    }
  })
}

export async function restoreFiles(
  repo: string,
  target: string,
  key: Buffer,
  snapshotId?: string,
) {
  const paths = separate(repo, target)
  const existing = await readdir(paths.destination).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [] as string[]
      throw error
    },
  )
  if (existing.length > 0)
    throw new Error('Destino de restauração deve estar vazio.')
  await mkdir(paths.destination, { recursive: true, mode: 0o700 })
  const selectedId = snapshotId ? snapshotIdSchema.parse(snapshotId) : undefined
  const selected = selectedId
    ? {
        id: selectedId,
        manifest: manifestSchema.parse(
          await readEncryptedJson(
            join(paths.source, 'snapshots', `${selectedId}.enc`),
            key,
            `manifest:${selectedId}`,
          ),
        ),
      }
    : await latestManifest(paths.source, key)
  const revoked = new Set((await ledger(paths.source, key)).revoked)
  let restored = 0
  for (const file of selected.manifest.files) {
    if (revoked.has(`${file.category}/${file.key}`)) continue
    const directory = join(paths.destination, file.category)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const targetPath = join(directory, file.key)
    await openFile(
      join(paths.source, 'objects', `${file.sha256}.enc`),
      targetPath,
      key,
      `object:${file.sha256}`,
    )
    if (
      (await sha256(targetPath)) !== file.sha256 ||
      (await stat(targetPath)).size !== file.size
    )
      throw new Error('Integridade de arquivo restaurado inválida.')
    restored++
  }
  return {
    id: selected.id,
    restored,
    suppressed: selected.manifest.files.length - restored,
  }
}

export async function revokeFromRestores(
  repo: string,
  key: Buffer,
  category: string,
  storageKey: string,
) {
  const selectedCategory = categorySchema.parse(category)
  const selectedKey = keySchema.parse(storageKey)
  return locked(repo, async () => {
    const current = await ledger(repo, key)
    const revoked = [
      ...new Set([...current.revoked, `${selectedCategory}/${selectedKey}`]),
    ].sort()
    const path = join(repo, 'revoked-ledger.enc')
    const temporary = join(repo, `revoked-ledger.${randomUUID()}.enc`)
    await writeEncryptedJson(
      { version: 1, revoked },
      temporary,
      key,
      'revoked-ledger',
    )
    await rename(temporary, path)
    return { count: revoked.length }
  })
}

async function main() {
  const [command, path1, path2, path3] = process.argv.slice(2)
  const key = backupKey(process.env)
  if (
    command === 'snapshot' &&
    path1 &&
    path2 &&
    (path3 === 'full' || path3 === 'incremental')
  )
    return snapshotFiles(path1, path2, key, path3)
  if (command === 'restore' && path1 && path2)
    return restoreFiles(path1, path2, key, path3)
  if (command === 'revoke' && path1 && path2 && path3)
    return revokeFromRestores(path1, key, path2, path3)
  throw new Error(
    'Uso: snapshot <storage> <repo> full|incremental; restore <repo> <destino> [snapshotId]; revoke <repo> <categoria> <storageKey>.',
  )
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1]))
  main().then(
    (result) => {
      process.stdout.write(
        `${JSON.stringify({ event: 'backup.operation_succeeded', result })}\n`,
      )
    },
    () => {
      process.stderr.write(
        `${JSON.stringify({ event: 'ops.alert', kind: 'backup_failed' })}\n`,
      )
      process.exitCode = 1
    },
  )
