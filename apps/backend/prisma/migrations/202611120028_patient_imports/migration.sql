CREATE TABLE "ImportBatch" (
 "id" UUID PRIMARY KEY,"kind" TEXT NOT NULL CHECK ("kind"='patients'),"sourceSystem" TEXT NOT NULL,
 "fileHash" TEXT NOT NULL,"fileEncrypted" TEXT NOT NULL,"fileErrors" JSONB NOT NULL,
 "status" TEXT NOT NULL CHECK ("status" IN ('preview','invalid','confirmed')),
 "createdBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL,"expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "cutoffDate" DATE,"confirmedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "ImportBatch_createdBy_createdAt_idx" ON "ImportBatch"("createdBy","createdAt");
CREATE TABLE "ImportRow" (
 "id" UUID PRIMARY KEY,"batchId" UUID NOT NULL REFERENCES "ImportBatch"("id") ON DELETE RESTRICT,
 "line" INTEGER NOT NULL,"previewStatus" TEXT NOT NULL,"previewErrors" JSONB NOT NULL,"previewDuplicateOf" TEXT,
 "finalStatus" TEXT,"finalErrors" JSONB,"finalDuplicateOf" TEXT,
 "targetId" UUID REFERENCES "PatientProfile"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "ImportRow_batchId_line_key" ON "ImportRow"("batchId","line");
CREATE TABLE "ImportIdentity" (
 "id" UUID PRIMARY KEY,"sourceSystem" TEXT NOT NULL,"kind" TEXT NOT NULL CHECK ("kind"='patients'),
 "externalId" TEXT NOT NULL,"rowHash" TEXT NOT NULL,"patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "batchId" UUID NOT NULL REFERENCES "ImportBatch"("id") ON DELETE RESTRICT,
 "importedAt" TIMESTAMPTZ(3) NOT NULL,"importedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "historicalStatus" TEXT NOT NULL DEFAULT 'undated' CHECK ("historicalStatus"='undated')
);
CREATE UNIQUE INDEX "ImportIdentity_patientId_key" ON "ImportIdentity"("patientId");
CREATE UNIQUE INDEX "ImportIdentity_sourceSystem_kind_externalId_key" ON "ImportIdentity"("sourceSystem","kind","externalId");
CREATE TABLE "ImportCommand" (
 "requestKey" TEXT PRIMARY KEY,"actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "batchId" UUID NOT NULL REFERENCES "ImportBatch"("id") ON DELETE RESTRICT,"inputHash" TEXT NOT NULL
);
CREATE TRIGGER import_identity_immutable BEFORE UPDATE OR DELETE ON "ImportIdentity" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE TRIGGER import_command_immutable BEFORE UPDATE OR DELETE ON "ImportCommand" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE FUNCTION preserve_import_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Import evidence cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='ImportBatch' THEN
  IF (NEW."id",NEW."kind",NEW."sourceSystem",NEW."fileHash",NEW."fileEncrypted",NEW."fileErrors",NEW."createdBy",NEW."createdAt",NEW."expiresAt",NEW."cutoffDate") IS DISTINCT FROM
     (OLD."id",OLD."kind",OLD."sourceSystem",OLD."fileHash",OLD."fileEncrypted",OLD."fileErrors",OLD."createdBy",OLD."createdAt",OLD."expiresAt",OLD."cutoffDate") OR
     OLD."status"<>'preview' OR NEW."status"<>'confirmed' OR NEW."confirmedAt" IS NULL THEN
   RAISE EXCEPTION 'Import batch evidence is immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW."id",NEW."batchId",NEW."line",NEW."previewStatus",NEW."previewErrors",NEW."previewDuplicateOf") IS DISTINCT FROM
     (OLD."id",OLD."batchId",OLD."line",OLD."previewStatus",OLD."previewErrors",OLD."previewDuplicateOf") OR OLD."finalStatus" IS NOT NULL THEN
   RAISE EXCEPTION 'Import row evidence is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER import_batch_evidence BEFORE UPDATE OR DELETE ON "ImportBatch" FOR EACH ROW EXECUTE FUNCTION preserve_import_evidence();
CREATE TRIGGER import_row_evidence BEFORE UPDATE OR DELETE ON "ImportRow" FOR EACH ROW EXECUTE FUNCTION preserve_import_evidence();
CREATE FUNCTION preserve_imported_patient() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "ImportIdentity" WHERE "patientId"=OLD."id") AND
   (NEW."fullName",NEW."birthDate",NEW."cpf",NEW."email",NEW."phone") IS DISTINCT FROM (OLD."fullName",OLD."birthDate",OLD."cpf",OLD."email",OLD."phone") THEN
  RAISE EXCEPTION 'Imported patient source requires an addendum' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER imported_patient_origin BEFORE UPDATE ON "PatientProfile" FOR EACH ROW EXECUTE FUNCTION preserve_imported_patient();
