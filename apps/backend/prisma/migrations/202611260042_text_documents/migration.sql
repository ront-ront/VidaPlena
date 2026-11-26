ALTER TABLE "ClinicalRetentionEvent" ADD COLUMN "clinicalDocumentId" UUID UNIQUE REFERENCES "ClinicalDocument"("id") ON DELETE RESTRICT;
ALTER TABLE "ClinicalRetentionEvent" DROP CONSTRAINT "ClinicalRetentionEvent_one_source";
ALTER TABLE "ClinicalRetentionEvent" ADD CONSTRAINT "ClinicalRetentionEvent_one_source" CHECK (("encounterId" IS NOT NULL)::int + ("examResultId" IS NOT NULL)::int + ("clinicalDocumentId" IS NOT NULL)::int = 1);
CREATE OR REPLACE FUNCTION check_clinical_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."encounterId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "ClinicalEncounter" WHERE "id"=NEW."encounterId" AND "recordId"=NEW."recordId" AND "status"='completed' AND "endedAt"=NEW."anchorAt") THEN RAISE EXCEPTION 'Retention anchor must match completed encounter'; END IF;
 ELSIF NEW."examResultId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "ExamResult" WHERE "id"=NEW."examResultId" AND "recordId"=NEW."recordId" AND "receivedAt"=NEW."anchorAt") THEN RAISE EXCEPTION 'Retention anchor must match received result'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "ClinicalDocument" WHERE "id"=NEW."clinicalDocumentId" AND "recordId"=NEW."recordId" AND "status" IN ('issued_dev','issued_valid') AND "issuedAt"=NEW."anchorAt") THEN RAISE EXCEPTION 'Retention anchor must match issued document'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_text_document_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."status"<>'draft' AND EXISTS(SELECT 1 FROM "DocumentTypeVersion" v JOIN "DocumentType" t ON t."id"=v."typeId" WHERE v."id"=NEW."typeVersionId" AND t."code" IN ('certificate','declaration','report','referral')) AND NOT EXISTS(SELECT 1 FROM "ClinicalRetentionEvent" WHERE "clinicalDocumentId"=NEW."id") THEN RAISE EXCEPTION 'Text document must commit with retention'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ClinicalDocument_text_retention" AFTER INSERT OR UPDATE ON "ClinicalDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_text_document_retention();
