ALTER TABLE "ImportBatch" DROP CONSTRAINT "ImportBatch_kind_check", DROP CONSTRAINT "ImportBatch_status_check";
ALTER TABLE "ImportBatch" ADD CHECK ("kind" IN ('patients','appointments')),
 ADD CHECK ("status" IN ('preview','invalid','confirmed') OR ("kind"='appointments' AND "status"='processing'));
ALTER TABLE "ImportIdentity" DROP CONSTRAINT "ImportIdentity_kind_check", DROP CONSTRAINT "ImportIdentity_historicalStatus_check";
ALTER TABLE "ImportIdentity" ALTER COLUMN "patientId" DROP NOT NULL,
 ADD COLUMN "appointmentId" UUID UNIQUE REFERENCES "Appointment"("id") ON DELETE RESTRICT,
 ADD CHECK (("kind"='patients' AND "patientId" IS NOT NULL AND "appointmentId" IS NULL AND "historicalStatus"='undated') OR
 ("kind"='appointments' AND "patientId" IS NULL AND "appointmentId" IS NOT NULL AND "historicalStatus" IN ('undated','before_cutoff','on_or_after_cutoff')));
ALTER TABLE "ImportRow" ADD COLUMN "appointmentId" UUID REFERENCES "Appointment"("id") ON DELETE RESTRICT,
 ADD CHECK ("targetId" IS NULL OR "appointmentId" IS NULL);
CREATE OR REPLACE FUNCTION preserve_import_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Import evidence cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='ImportBatch' THEN
  IF (NEW."id",NEW."kind",NEW."sourceSystem",NEW."fileHash",NEW."fileEncrypted",NEW."fileErrors",NEW."createdBy",NEW."createdAt",NEW."expiresAt",NEW."cutoffDate") IS DISTINCT FROM
     (OLD."id",OLD."kind",OLD."sourceSystem",OLD."fileHash",OLD."fileEncrypted",OLD."fileErrors",OLD."createdBy",OLD."createdAt",OLD."expiresAt",OLD."cutoffDate") OR
     NOT ((NEW."kind"='patients' AND OLD."status"='preview' AND NEW."status"='confirmed' AND NEW."confirmedAt" IS NOT NULL) OR
          (NEW."kind"='appointments' AND ((OLD."status"='preview' AND NEW."status"='processing' AND NEW."confirmedAt" IS NULL) OR
          (OLD."status"='processing' AND NEW."status"='confirmed' AND NEW."confirmedAt" IS NOT NULL)))) THEN
   RAISE EXCEPTION 'Import batch evidence is immutable' USING ERRCODE='23514'; END IF;
  IF NEW."kind"='appointments' AND NEW."status"='confirmed' AND EXISTS(SELECT 1 FROM "ImportRow" WHERE "batchId"=NEW."id" AND "finalStatus" IS NULL) THEN
   RAISE EXCEPTION 'Import batch has unfinished rows' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW."id",NEW."batchId",NEW."line",NEW."previewStatus",NEW."previewErrors",NEW."previewDuplicateOf") IS DISTINCT FROM
     (OLD."id",OLD."batchId",OLD."line",OLD."previewStatus",OLD."previewErrors",OLD."previewDuplicateOf") OR OLD."finalStatus" IS NOT NULL THEN
   RAISE EXCEPTION 'Import row evidence is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW; END $$;
