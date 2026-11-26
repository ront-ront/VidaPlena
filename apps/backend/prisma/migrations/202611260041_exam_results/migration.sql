CREATE TABLE "ExamResult" (
 "id" UUID PRIMARY KEY,
 "recordId" UUID NOT NULL REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT,
 "orderId" UUID REFERENCES "ExamOrder"("id") ON DELETE RESTRICT,
 "fileId" UUID NOT NULL UNIQUE REFERENCES "FileObject"("id") ON DELETE RESTRICT,
 "submittedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "receivedAt" TIMESTAMPTZ(3) NOT NULL,
 "origin" TEXT NOT NULL,
 CHECK (("origin"='ordered' AND "orderId" IS NOT NULL) OR ("origin"='external' AND "orderId" IS NULL))
);
CREATE INDEX "ExamResult_recordId_receivedAt_id_idx" ON "ExamResult"("recordId","receivedAt","id");
CREATE INDEX "ExamResult_orderId_receivedAt_id_idx" ON "ExamResult"("orderId","receivedAt","id");
CREATE TRIGGER "ExamResult_immutable" BEFORE UPDATE OR DELETE ON "ExamResult" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ExamResult_no_truncate" BEFORE TRUNCATE ON "ExamResult" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();

CREATE FUNCTION check_exam_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f "FileObject"%ROWTYPE; p UUID;
BEGIN
 SELECT "patientId" INTO p FROM "ClinicalRecord" WHERE "id"=NEW."recordId";
 SELECT * INTO f FROM "FileObject" WHERE "id"=NEW."fileId" FOR UPDATE;
 IF NOT FOUND OR f."category"<>'result' OR f."ownerPatientId" IS DISTINCT FROM p OR f."linkedResourceType"<>'ExamResult' OR f."linkedResourceId"<>NEW."id"::text OR f."uploadedBy" IS DISTINCT FROM NEW."submittedBy" OR f."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Exam result file binding mismatch'; END IF;
 IF NEW."orderId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "ExamOrder" e JOIN "ClinicalDocument" d ON d."id"=e."documentId"
  WHERE e."id"=NEW."orderId" AND d."recordId"=NEW."recordId" AND d."status" IN ('issued_dev','issued_valid')
   AND NOT EXISTS(SELECT 1 FROM "ClinicalDocumentVoid" v WHERE v."documentId"=d."id")
 ) THEN RAISE EXCEPTION 'Exam result requires a matching issued order'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ExamResult_binding" BEFORE INSERT ON "ExamResult" FOR EACH ROW EXECUTE FUNCTION check_exam_result();
CREATE FUNCTION protect_exam_result_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "ExamResult" WHERE "fileId"=OLD."id") THEN RAISE EXCEPTION 'Exam result file is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "ExamResult_file_immutable" BEFORE UPDATE OR DELETE ON "FileObject" FOR EACH ROW EXECUTE FUNCTION protect_exam_result_file();

ALTER TABLE "ExamOrder" DROP CONSTRAINT "ExamOrder_initial_receipt";
CREATE OR REPLACE FUNCTION protect_exam_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."id",NEW."documentId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."documentId",OLD."createdAt") OR OLD."resultReceivedAt" IS NOT NULL OR NEW."resultReceivedAt" IS NULL OR NOT EXISTS(SELECT 1 FROM "ExamResult" r WHERE r."orderId"=NEW."id" AND r."receivedAt"=NEW."resultReceivedAt") THEN RAISE EXCEPTION 'Exam receipt must match first real result'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Exam order preserves history'; END IF;
 IF NEW."resultReceivedAt" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM "ClinicalDocument" d JOIN "DocumentTypeVersion" v ON v."id"=d."typeVersionId" JOIN "DocumentType" t ON t."id"=v."typeId" WHERE d."id"=NEW."documentId" AND d."status"='draft' AND t."code"='exam_order') THEN RAISE EXCEPTION 'Exam order requires exam document draft'; END IF;
 RETURN NEW;
END $$;

ALTER TABLE "ClinicalRetentionEvent" ALTER COLUMN "encounterId" DROP NOT NULL;
ALTER TABLE "ClinicalRetentionEvent" ADD COLUMN "examResultId" UUID UNIQUE REFERENCES "ExamResult"("id") ON DELETE RESTRICT;
ALTER TABLE "ClinicalRetentionEvent" ADD CONSTRAINT "ClinicalRetentionEvent_one_source" CHECK (("encounterId" IS NOT NULL)::int + ("examResultId" IS NOT NULL)::int = 1);
CREATE OR REPLACE FUNCTION check_clinical_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."encounterId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "ClinicalEncounter" WHERE "id"=NEW."encounterId" AND "recordId"=NEW."recordId" AND "status"='completed' AND "endedAt"=NEW."anchorAt") THEN RAISE EXCEPTION 'Retention anchor must match completed encounter'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "ExamResult" WHERE "id"=NEW."examResultId" AND "recordId"=NEW."recordId" AND "receivedAt"=NEW."anchorAt") THEN RAISE EXCEPTION 'Retention anchor must match received result'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_exam_result_projections() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ClinicalRetentionEvent" WHERE "examResultId"=NEW."id") THEN RAISE EXCEPTION 'Exam result must commit with retention'; END IF;
 IF NEW."orderId" IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM "ExamOrder" e WHERE e."id"=NEW."orderId" AND e."resultReceivedAt"=(SELECT min(r."receivedAt") FROM "ExamResult" r WHERE r."orderId"=NEW."orderId")
 ) THEN RAISE EXCEPTION 'Exam result must commit with first receipt projection'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ExamResult_projections" AFTER INSERT ON "ExamResult" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_exam_result_projections();
