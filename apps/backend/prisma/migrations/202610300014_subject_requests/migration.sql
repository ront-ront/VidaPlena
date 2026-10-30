CREATE TABLE "DataSubjectRequest" (
  "id" UUID NOT NULL,
  "subjectPatientId" UUID NOT NULL,
  "requesterUserId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "description" TEXT,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "handledBy" UUID,
  "resolution" JSONB,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataSubjectRequest_kind_check" CHECK ("kind" IN ('access','correction','export','erasure')),
  CONSTRAINT "DataSubjectRequest_status_check" CHECK ("status" IN ('open','resolved'))
);
CREATE INDEX "DataSubjectRequest_subjectPatientId_submittedAt_id_idx" ON "DataSubjectRequest"("subjectPatientId", "submittedAt", "id");
CREATE INDEX "DataSubjectRequest_status_dueAt_id_idx" ON "DataSubjectRequest"("status", "dueAt", "id");
CREATE INDEX "DataSubjectRequest_requesterUserId_submittedAt_id_idx" ON "DataSubjectRequest"("requesterUserId", "submittedAt", "id");
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_subjectPatientId_fkey" FOREIGN KEY ("subjectPatientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DataSubjectExport" (
  "requestId" UUID NOT NULL,
  "payloadEncrypted" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataSubjectExport_pkey" PRIMARY KEY ("requestId")
);
ALTER TABLE "DataSubjectExport" ADD CONSTRAINT "DataSubjectExport_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
