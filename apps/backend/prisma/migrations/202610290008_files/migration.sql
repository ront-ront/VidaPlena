CREATE TABLE "FileObject" (
  "id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "ownerPatientId" UUID,
  "linkedResourceType" TEXT NOT NULL,
  "linkedResourceId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentTypeDetected" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "sha256" TEXT NOT NULL,
  "encryptionKeyRef" TEXT NOT NULL,
  "scanStatus" TEXT NOT NULL,
  "uploadedBy" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");
CREATE INDEX "FileObject_ownerPatientId_createdAt_idx" ON "FileObject"("ownerPatientId", "createdAt");
CREATE INDEX "FileObject_linkedResourceType_linkedResourceId_revokedAt_idx" ON "FileObject"("linkedResourceType", "linkedResourceId", "revokedAt");
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerPatientId_fkey" FOREIGN KEY ("ownerPatientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
