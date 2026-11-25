CREATE TABLE "ExamOrder" ("id" UUID PRIMARY KEY,"documentId" UUID NOT NULL UNIQUE REFERENCES "ClinicalDocument"("id") ON DELETE RESTRICT,"createdAt" TIMESTAMPTZ(3) NOT NULL,"resultReceivedAt" TIMESTAMPTZ(3),CONSTRAINT "ExamOrder_initial_receipt" CHECK("resultReceivedAt" IS NULL));
CREATE INDEX "ClinicalDocument_authorProfessionalId_status_issuedAt_id_idx" ON "ClinicalDocument"("authorProfessionalId","status","issuedAt","id");
CREATE FUNCTION protect_exam_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Exam order preserves history'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ClinicalDocument" d JOIN "DocumentTypeVersion" v ON v."id"=d."typeVersionId" JOIN "DocumentType" t ON t."id"=v."typeId" WHERE d."id"=NEW."documentId" AND d."status"='draft' AND t."code"='exam_order') THEN RAISE EXCEPTION 'Exam order requires exam document draft'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "ExamOrder_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "ExamOrder" FOR EACH ROW EXECUTE FUNCTION protect_exam_order();
CREATE TRIGGER "ExamOrder_no_truncate" BEFORE TRUNCATE ON "ExamOrder" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION require_issued_exam_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ClinicalDocument" WHERE "id"=NEW."documentId" AND "status" IN ('issued_dev','issued_valid')) THEN RAISE EXCEPTION 'Exam order must commit with issued document'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ExamOrder_requires_issuance" AFTER INSERT ON "ExamOrder" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_issued_exam_order();
