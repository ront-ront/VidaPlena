import type { Readable } from 'node:stream'
import type { Principal } from '../../domain/rules/access'
import type { AuditContext, AuditWriter } from './audit-writer'

export type FileCategory = 'attachment' | 'result' | 'recording'
export interface StoredFile {
  category: FileCategory
  storageKey: string
  size: number
  sha256: string
  firstBytes: Buffer
}
export interface FileStorage {
  write(
    category: FileCategory,
    source: Readable,
    maxBytes: number,
  ): Promise<StoredFile>
  read(category: FileCategory, storageKey: string): Promise<Readable>
  remove(category: FileCategory, storageKey: string): Promise<void>
}
export interface ScanResult {
  detectedType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'video/webm'
  status: 'skipped_dev'
}
export interface MalwareScanner {
  scan(input: {
    category: FileCategory
    filename: string
    firstBytes: Buffer
    size: number
    maxBytes: number
  }): Promise<ScanResult>
}

export interface FileRecord {
  id: string
  category: FileCategory
  ownerPatientId: string | null
  linkedResourceType: string
  linkedResourceId: string
  storageKey: string
  contentTypeDetected: string
  size: number
  sha256: string
  scanStatus: string
  revokedAt: Date | null
}
export interface FileRepository {
  create(
    input: Omit<FileRecord, 'id' | 'revokedAt'> & { uploadedBy?: string },
    maxPerRecord: number,
    context: AuditContext,
  ): Promise<FileRecord>
  get(id: string): Promise<FileRecord | null>
  revoke(id: string, at: Date): Promise<void>
  discardUnlinked(id: string): Promise<boolean>
  audit: AuditWriter
}
export interface FileAccessPolicy {
  canUpload(
    actor: Principal | null,
    input: {
      category: FileCategory
      patientId: string | null
      linkedResourceType: string
    },
  ): Promise<boolean>
  canDownload(actor: Principal, file: FileRecord): Promise<boolean>
}
export interface FileDownloadTokens {
  issue(input: {
    fileId: string
    userId: string
    sessionId: string
    expiresAt: Date
  }): string
  verify(
    token: string,
    now: Date,
  ): {
    fileId: string
    userId: string
    sessionId: string
  } | null
}
