CREATE TABLE "DocumentType" ("id" UUID PRIMARY KEY,"code" TEXT NOT NULL UNIQUE CHECK("code" IN ('prescription','certificate','exam_order','declaration','report','referral')),"label" TEXT NOT NULL);
CREATE TABLE "DocumentTypeVersion" (
 "id" UUID PRIMARY KEY,"typeId" UUID NOT NULL REFERENCES "DocumentType"("id") ON DELETE RESTRICT,
 "version" INTEGER NOT NULL CHECK("version">0),"requiredSignatureLevel" TEXT NOT NULL CHECK("requiredSignatureLevel" IN ('simple','qualified')),
 "templateVersion" TEXT NOT NULL CHECK(length("templateVersion") BETWEEN 1 AND 80),"active" BOOLEAN NOT NULL,
 "reasonEncrypted" TEXT,"changedByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT,"createdAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "DocumentTypeVersion_typeId_version_key" UNIQUE("typeId","version"),
 CHECK (("version"=1 AND "changedByUserId" IS NULL AND "reasonEncrypted" IS NULL) OR ("version">1 AND "changedByUserId" IS NOT NULL AND "reasonEncrypted" IS NOT NULL))
);
CREATE FUNCTION check_document_type_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous INTEGER; BEGIN
 PERFORM 1 FROM "DocumentType" WHERE "id"=NEW."typeId" FOR UPDATE;
 SELECT COALESCE(MAX("version"),0) INTO previous FROM "DocumentTypeVersion" WHERE "typeId"=NEW."typeId";
 IF NEW."version"<>previous+1 THEN RAISE EXCEPTION 'Document type version must advance once'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "DocumentTypeVersion_sequence" BEFORE INSERT ON "DocumentTypeVersion" FOR EACH ROW EXECUTE FUNCTION check_document_type_version();
CREATE TRIGGER "DocumentType_immutable" BEFORE UPDATE OR DELETE ON "DocumentType" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "DocumentTypeVersion_immutable" BEFORE UPDATE OR DELETE ON "DocumentTypeVersion" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "DocumentType_no_truncate" BEFORE TRUNCATE ON "DocumentType" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "DocumentTypeVersion_no_truncate" BEFORE TRUNCATE ON "DocumentTypeVersion" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
INSERT INTO "DocumentType" ("id","code","label") VALUES
 (gen_random_uuid(),'prescription','Prescrição'),(gen_random_uuid(),'certificate','Atestado'),(gen_random_uuid(),'exam_order','Pedido de exame'),
 (gen_random_uuid(),'declaration','Declaração de comparecimento'),(gen_random_uuid(),'report','Relatório'),(gen_random_uuid(),'referral','Encaminhamento') ON CONFLICT("code") DO NOTHING;
INSERT INTO "DocumentTypeVersion" ("id","typeId","version","requiredSignatureLevel","templateVersion","active","createdAt")
 SELECT gen_random_uuid(),t."id",1,CASE WHEN t."code"='declaration' THEN 'simple' ELSE 'qualified' END,'1',true,now() FROM "DocumentType" t WHERE NOT EXISTS(SELECT 1 FROM "DocumentTypeVersion" v WHERE v."typeId"=t."id");
CREATE TABLE "ClinicalDocument" (
 "id" UUID PRIMARY KEY,"recordId" UUID NOT NULL REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT,
 "encounterId" UUID NOT NULL REFERENCES "ClinicalEncounter"("id") ON DELETE RESTRICT,"authorProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "typeVersionId" UUID NOT NULL REFERENCES "DocumentTypeVersion"("id") ON DELETE RESTRICT,
 "payloadVersion" INTEGER NOT NULL DEFAULT 1 CHECK("payloadVersion">0),"payloadEncrypted" TEXT NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK("version">0),"status" TEXT NOT NULL DEFAULT 'draft' CHECK("status" IN ('draft','issued_dev','issued_valid')),
 "createdAt" TIMESTAMPTZ(3) NOT NULL,"savedAt" TIMESTAMPTZ(3) NOT NULL CHECK("savedAt">="createdAt"),
 "canonicalEncrypted" TEXT,"signatureEncrypted" TEXT,"sha256" TEXT,"verificationCodeHash" TEXT UNIQUE,"issuedAt" TIMESTAMPTZ(3),
 CHECK (("status"='draft' AND "canonicalEncrypted" IS NULL AND "signatureEncrypted" IS NULL AND "sha256" IS NULL AND "verificationCodeHash" IS NULL AND "issuedAt" IS NULL) OR
 ("status" IN ('issued_dev','issued_valid') AND "canonicalEncrypted" IS NOT NULL AND "signatureEncrypted" IS NOT NULL AND "sha256" IS NOT NULL AND "sha256" ~ '^[a-f0-9]{64}$' AND "verificationCodeHash" IS NOT NULL AND "verificationCodeHash" ~ '^[a-f0-9]{64}$' AND "issuedAt" IS NOT NULL AND "issuedAt">="savedAt"))
);
CREATE INDEX "ClinicalDocument_recordId_status_createdAt_id_idx" ON "ClinicalDocument"("recordId","status","createdAt","id");
CREATE FUNCTION protect_clinical_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "ClinicalEncounter"%ROWTYPE; previous_type UUID; next_type UUID;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical document preserves history'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."status"<>'draft' THEN RAISE EXCEPTION 'Issued document is immutable'; END IF;
  IF ROW(NEW."id",NEW."recordId",NEW."encounterId",NEW."authorProfessionalId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."recordId",OLD."encounterId",OLD."authorProfessionalId",OLD."createdAt") THEN RAISE EXCEPTION 'Document identity is immutable'; END IF;
  SELECT "typeId" INTO previous_type FROM "DocumentTypeVersion" WHERE "id"=OLD."typeVersionId"; SELECT "typeId" INTO next_type FROM "DocumentTypeVersion" WHERE "id"=NEW."typeVersionId";
  IF previous_type IS DISTINCT FROM next_type THEN RAISE EXCEPTION 'Document type identity is immutable'; END IF;
  IF NEW."status"='draft' AND NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Document draft version must advance once'; END IF;
  IF NEW."status"<>'draft' AND ROW(NEW."payloadEncrypted",NEW."payloadVersion",NEW."typeVersionId",NEW."version",NEW."savedAt") IS DISTINCT FROM ROW(OLD."payloadEncrypted",OLD."payloadVersion",OLD."typeVersionId",OLD."version",OLD."savedAt") THEN RAISE EXCEPTION 'Issuance preserves saved draft'; END IF;
 ELSIF NEW."status"<>'draft' THEN RAISE EXCEPTION 'Document must start as draft';
 END IF;
 SELECT * INTO e FROM "ClinicalEncounter" WHERE "id"=NEW."encounterId";
 IF ROW(NEW."recordId",NEW."authorProfessionalId") IS DISTINCT FROM ROW(e."recordId",e."professionalId") THEN RAISE EXCEPTION 'Document subject/author must match encounter'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalDocument_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "ClinicalDocument" FOR EACH ROW EXECUTE FUNCTION protect_clinical_document();
CREATE TRIGGER "ClinicalDocument_no_truncate" BEFORE TRUNCATE ON "ClinicalDocument" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE TABLE "ClinicalDocumentVoid" (
 "id" UUID PRIMARY KEY,"documentId" UUID NOT NULL UNIQUE REFERENCES "ClinicalDocument"("id") ON DELETE RESTRICT,
 "authorProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,"reasonEncrypted" TEXT NOT NULL,
 "replacementDocumentId" UUID REFERENCES "ClinicalDocument"("id") ON DELETE RESTRICT,"createdAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK("replacementDocumentId" IS NULL OR "replacementDocumentId"<>"documentId")
);
CREATE FUNCTION check_clinical_document_void() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "ClinicalDocument"%ROWTYPE; BEGIN
 SELECT * INTO d FROM "ClinicalDocument" WHERE "id"=NEW."documentId" FOR UPDATE;
 IF d."status"='draft' OR NEW."authorProfessionalId" IS DISTINCT FROM d."authorProfessionalId" OR NEW."createdAt"<d."issuedAt" THEN RAISE EXCEPTION 'Void requires issued document and its author'; END IF;
 IF NEW."replacementDocumentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ClinicalDocument" r JOIN "DocumentTypeVersion" rt ON rt."id"=r."typeVersionId" JOIN "DocumentTypeVersion" dt ON dt."id"=d."typeVersionId" WHERE r."id"=NEW."replacementDocumentId" AND r."recordId"=d."recordId" AND r."authorProfessionalId"=d."authorProfessionalId" AND rt."typeId"=dt."typeId" AND r."status"<>'draft' AND NOT EXISTS(SELECT 1 FROM "ClinicalDocumentVoid" v WHERE v."documentId"=r."id")) THEN RAISE EXCEPTION 'Invalid replacement document'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalDocumentVoid_author" BEFORE INSERT ON "ClinicalDocumentVoid" FOR EACH ROW EXECUTE FUNCTION check_clinical_document_void();
CREATE TRIGGER "ClinicalDocumentVoid_immutable" BEFORE UPDATE OR DELETE ON "ClinicalDocumentVoid" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalDocumentVoid_no_truncate" BEFORE TRUNCATE ON "ClinicalDocumentVoid" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION protect_document_file() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "ClinicalDocument"%ROWTYPE; p UUID; BEGIN
 IF TG_OP<>'INSERT' AND OLD."linkedResourceType"='ClinicalDocument' THEN
  SELECT * INTO d FROM "ClinicalDocument" WHERE "id"::text=OLD."linkedResourceId" FOR UPDATE;
  IF d."status"<>'draft' THEN RAISE EXCEPTION 'Issued document file is immutable'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND NEW."linkedResourceType"='ClinicalDocument' THEN
  SELECT * INTO d FROM "ClinicalDocument" WHERE "id"::text=NEW."linkedResourceId" FOR UPDATE;
  IF NOT FOUND OR d."status"<>'draft' THEN RAISE EXCEPTION 'Document files require draft'; END IF;
  SELECT "patientId" INTO p FROM "ClinicalRecord" WHERE "id"=d."recordId";
  IF NEW."ownerPatientId" IS DISTINCT FROM p OR NEW."category"<>'attachment' THEN RAISE EXCEPTION 'Document file subject mismatch'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "FileObject_document_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "FileObject" FOR EACH ROW EXECUTE FUNCTION protect_document_file();
CREATE FUNCTION protect_retained_files_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "FileObject" WHERE "linkedResourceType" IN ('ClinicalDocument','ClinicalEvolution','ImportedHistory')) THEN RAISE EXCEPTION 'Clinical files preserve history'; END IF; RETURN NULL;
END $$;
CREATE TRIGGER "FileObject_clinical_no_truncate" BEFORE TRUNCATE ON "FileObject" FOR EACH STATEMENT EXECUTE FUNCTION protect_retained_files_truncate();
