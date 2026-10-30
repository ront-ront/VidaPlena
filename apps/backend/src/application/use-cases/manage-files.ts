import type { Readable } from 'node:stream'
import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type {
  FileAccessPolicy,
  FileCategory,
  FileDownloadTokens,
  FileRepository,
  FileStorage,
  MalwareScanner,
} from '../ports/files'

export class ManageFiles {
  constructor(
    private readonly storage: FileStorage,
    private readonly scanner: MalwareScanner,
    private readonly repository: FileRepository,
    private readonly policy: FileAccessPolicy,
    private readonly tokens: FileDownloadTokens,
    private readonly limits: {
      attachmentMaxMb: number
      resultMaxMb: number
      recordingMaxMb: number
      maxPerRecord: number
      signedUrlTtlSeconds: number
    },
    private readonly now = () => new Date(),
  ) {}

  async upload(input: {
    actor: Principal | null
    category: FileCategory
    ownerPatientId: string | null
    linkedResourceType: string
    linkedResourceId: string
    filename: string
    source: Readable
    context: AuditContext
  }) {
    if (
      !(await this.policy.canUpload(input.actor, {
        category: input.category,
        patientId: input.ownerPatientId,
        linkedResourceType: input.linkedResourceType,
      }))
    )
      throw new ApplicationError('FORBIDDEN')
    const maxMb = {
      attachment: this.limits.attachmentMaxMb,
      result: this.limits.resultMaxMb,
      recording: this.limits.recordingMaxMb,
    }[input.category]
    const maxBytes = maxMb * 1024 * 1024
    const saved = await this.storage.write(
      input.category,
      input.source,
      maxBytes,
    )
    try {
      const scan = await this.scanner.scan({
        category: input.category,
        filename: input.filename,
        firstBytes: saved.firstBytes,
        size: saved.size,
        maxBytes,
      })
      const record = await this.repository.create(
        {
          category: input.category,
          ownerPatientId: input.ownerPatientId,
          linkedResourceType: input.linkedResourceType,
          linkedResourceId: input.linkedResourceId,
          storageKey: saved.storageKey,
          contentTypeDetected: scan.detectedType,
          size: saved.size,
          sha256: saved.sha256,
          scanStatus: scan.status,
          uploadedBy: input.actor?.userId,
        },
        this.limits.maxPerRecord,
        input.context,
      )
      return {
        fileId: record.id,
        detectedType: record.contentTypeDetected,
        size: record.size,
        scanStatus: record.scanStatus,
      }
    } catch (error) {
      await this.storage.remove(input.category, saved.storageKey)
      throw error
    }
  }

  async discardUnlinked(fileId: string) {
    const file = await this.repository.get(fileId)
    if (file?.linkedResourceType !== 'ConsentEvent') return
    if (await this.repository.discardUnlinked(fileId))
      await this.storage.remove(file.category, file.storageKey)
  }

  async downloadLink(actor: Principal, fileId: string, context: AuditContext) {
    const file = await this.requireReadable(actor, fileId)
    const expiresAt = new Date(
      this.now().getTime() + this.limits.signedUrlTtlSeconds * 1000,
    )
    const token = this.tokens.issue({
      fileId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      expiresAt,
    })
    await this.repository.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action: 'file.link_issued',
      resourceType: 'FileObject',
      resourceId: fileId,
      subjectPatientId: file.ownerPatientId ?? undefined,
    })
    return { url: `/v1/file-download/${token}`, expiresAt }
  }

  async download(actor: Principal, token: string, context: AuditContext) {
    const proof = this.tokens.verify(token, this.now())
    if (!proof) throw new ApplicationError('TOKEN_EXPIRED')
    if (proof.userId !== actor.userId || proof.sessionId !== actor.sessionId)
      throw new ApplicationError('FORBIDDEN')
    const file = await this.requireReadable(actor, proof.fileId)
    const stream = await this.storage.read(file.category, file.storageKey)
    await this.repository.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action: 'file.downloaded',
      resourceType: 'FileObject',
      resourceId: file.id,
      subjectPatientId: file.ownerPatientId ?? undefined,
    })
    return { stream, contentType: file.contentTypeDetected, size: file.size }
  }

  private async requireReadable(actor: Principal, fileId: string) {
    const file = await this.repository.get(fileId)
    if (
      !file ||
      file.revokedAt ||
      !(await this.policy.canDownload(actor, file))
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return file
  }
}

export class DenyFileAccess implements FileAccessPolicy {
  async canUpload() {
    return false
  }
  async canDownload() {
    return false
  }
}
