CREATE TABLE "MedicationCatalog" ("id" UUID PRIMARY KEY,"version" TEXT NOT NULL UNIQUE,"source" TEXT NOT NULL,"license" TEXT NOT NULL,"demo" BOOLEAN NOT NULL,"checksum" TEXT NOT NULL CHECK("checksum" ~ '^[a-f0-9]{64}$'),"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now());
CREATE TABLE "MedicationEntry" ("id" UUID PRIMARY KEY,"catalogId" UUID NOT NULL REFERENCES "MedicationCatalog"("id") ON DELETE RESTRICT,"code" TEXT NOT NULL,"name" TEXT NOT NULL,"activeSubstances" JSONB NOT NULL CHECK(jsonb_typeof("activeSubstances")='array'),"searchText" TEXT NOT NULL,"active" BOOLEAN NOT NULL,"controlled" BOOLEAN NOT NULL,CONSTRAINT "MedicationEntry_catalogId_code_key" UNIQUE("catalogId","code"));
CREATE INDEX "MedicationEntry_catalogId_active_code_id_idx" ON "MedicationEntry"("catalogId","active","code","id");
CREATE TABLE "MedicationSelection" ("id" TEXT PRIMARY KEY CHECK("id"='active'),"catalogId" UUID NOT NULL UNIQUE REFERENCES "MedicationCatalog"("id") ON DELETE RESTRICT);
CREATE TRIGGER "MedicationCatalog_immutable" BEFORE UPDATE OR DELETE ON "MedicationCatalog" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "MedicationEntry_immutable" BEFORE UPDATE OR DELETE ON "MedicationEntry" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "MedicationCatalog_no_truncate" BEFORE TRUNCATE ON "MedicationCatalog" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "MedicationEntry_no_truncate" BEFORE TRUNCATE ON "MedicationEntry" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
ALTER TABLE "ClinicalDocument" ADD COLUMN "copiedFromDocumentId" UUID REFERENCES "ClinicalDocument"("id") ON DELETE RESTRICT;
CREATE FUNCTION protect_document_copy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."copiedFromDocumentId" IS DISTINCT FROM OLD."copiedFromDocumentId" THEN RAISE EXCEPTION 'Document copy origin is immutable'; END IF;
 IF TG_OP='INSERT' AND NEW."copiedFromDocumentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ClinicalDocument" s JOIN "DocumentTypeVersion" st ON st."id"=s."typeVersionId" JOIN "DocumentTypeVersion" nt ON nt."id"=NEW."typeVersionId" WHERE s."id"=NEW."copiedFromDocumentId" AND s."recordId"=NEW."recordId" AND s."status"<>'draft' AND st."typeId"=nt."typeId" AND NOT EXISTS(SELECT 1 FROM "ClinicalDocumentVoid" v WHERE v."documentId"=s."id")) THEN RAISE EXCEPTION 'Copy requires issued source of same patient and type'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalDocument_copy_origin" BEFORE INSERT OR UPDATE ON "ClinicalDocument" FOR EACH ROW EXECUTE FUNCTION protect_document_copy();
CREATE TABLE "PrescriptionAllergyAcknowledgement" (
 "id" UUID PRIMARY KEY,"documentId" UUID NOT NULL REFERENCES "ClinicalDocument"("id") ON DELETE RESTRICT,"alertId" UUID NOT NULL REFERENCES "ClinicalAlert"("id") ON DELETE RESTRICT,"alertVersion" INTEGER NOT NULL,"professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,"acknowledgedAt" TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY("alertId","alertVersion") REFERENCES "ClinicalAlertEvent"("alertId","version") ON DELETE RESTRICT,
 CONSTRAINT "PrescriptionAllergyAcknowledgement_documentId_alertId_key" UNIQUE("documentId","alertId")
);
CREATE FUNCTION check_prescription_acknowledgement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ClinicalAlert"%ROWTYPE; d "ClinicalDocument"%ROWTYPE; p UUID; document_kind TEXT;
BEGIN
 SELECT * INTO a FROM "ClinicalAlert" WHERE "id"=NEW."alertId" FOR UPDATE;
 SELECT * INTO d FROM "ClinicalDocument" WHERE "id"=NEW."documentId" FOR UPDATE;
 SELECT "patientId" INTO p FROM "ClinicalRecord" WHERE "id"=d."recordId";
 SELECT t."code" INTO document_kind FROM "DocumentTypeVersion" v JOIN "DocumentType" t ON t."id"=v."typeId" WHERE v."id"=d."typeVersionId";
 IF d."status"<>'draft' OR document_kind<>'prescription' OR d."authorProfessionalId" IS DISTINCT FROM NEW."professionalId" OR a."patientId" IS DISTINCT FROM p OR a."kind"<>'allergy' OR EXISTS(SELECT 1 FROM "ClinicalAlertEvent" WHERE "alertId"=a."id" AND "kind"='deactivated') OR NEW."alertVersion" IS DISTINCT FROM (SELECT MAX("version") FROM "ClinicalAlertEvent" WHERE "alertId"=a."id") THEN RAISE EXCEPTION 'Acknowledgement requires active allergy and prescribing author'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "PrescriptionAllergyAcknowledgement_subject" BEFORE INSERT ON "PrescriptionAllergyAcknowledgement" FOR EACH ROW EXECUTE FUNCTION check_prescription_acknowledgement();
CREATE TRIGGER "PrescriptionAllergyAcknowledgement_immutable" BEFORE UPDATE OR DELETE ON "PrescriptionAllergyAcknowledgement" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "PrescriptionAllergyAcknowledgement_no_truncate" BEFORE TRUNCATE ON "PrescriptionAllergyAcknowledgement" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
