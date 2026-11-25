CREATE TABLE "ImportedHistory" (
 "id" UUID PRIMARY KEY, "recordId" UUID NOT NULL REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT,
 "fileId" UUID NOT NULL UNIQUE REFERENCES "FileObject"("id") ON DELETE RESTRICT,
 "metadataEncrypted" TEXT NOT NULL, "originalDate" DATE,
 "importedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "importedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "ImportedHistory_recordId_importedAt_id_idx" ON "ImportedHistory"("recordId","importedAt","id");
CREATE TABLE "ImportedHistoryCheck" (
 "id" UUID PRIMARY KEY, "historyId" UUID NOT NULL UNIQUE REFERENCES "ImportedHistory"("id") ON DELETE RESTRICT,
 "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "checkedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "ImportedHistoryAddendum" (
 "id" UUID PRIMARY KEY, "historyId" UUID NOT NULL REFERENCES "ImportedHistory"("id") ON DELETE RESTRICT,
 "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "contentEncrypted" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "ImportedHistoryAddendum_historyId_createdAt_id_idx" ON "ImportedHistoryAddendum"("historyId","createdAt","id");
CREATE TRIGGER "ImportedHistory_immutable" BEFORE UPDATE OR DELETE ON "ImportedHistory" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ImportedHistoryCheck_immutable" BEFORE UPDATE OR DELETE ON "ImportedHistoryCheck" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ImportedHistoryAddendum_immutable" BEFORE UPDATE OR DELETE ON "ImportedHistoryAddendum" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION protect_imported_history_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "ImportedHistory" WHERE "fileId"=OLD."id") THEN RAISE EXCEPTION 'Imported history file is immutable'; END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; ELSE RETURN OLD; END IF;
END $$;
CREATE TRIGGER "ImportedHistory_file_immutable" BEFORE UPDATE OR DELETE ON "FileObject" FOR EACH ROW EXECUTE FUNCTION protect_imported_history_file();
CREATE FUNCTION check_imported_history_file() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f "FileObject"%ROWTYPE; p UUID;
BEGIN
 SELECT * INTO f FROM "FileObject" WHERE "id"=NEW."fileId";
 SELECT "patientId" INTO p FROM "ClinicalRecord" WHERE "id"=NEW."recordId";
 IF f."category"<>'attachment' OR f."ownerPatientId" IS DISTINCT FROM p OR f."linkedResourceType"<>'ImportedHistory' OR f."linkedResourceId"<>NEW."id"::text OR f."uploadedBy" IS DISTINCT FROM NEW."importedBy" OR f."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Imported history file binding mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ImportedHistory_file_binding" BEFORE INSERT ON "ImportedHistory" FOR EACH ROW EXECUTE FUNCTION check_imported_history_file();
