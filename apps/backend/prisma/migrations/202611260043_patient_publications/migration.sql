CREATE TABLE "PatientPublication" (
 "id" UUID PRIMARY KEY,"patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "resourceType" TEXT NOT NULL,"resourceId" UUID NOT NULL,"visibilityKind" TEXT NOT NULL,
 "publishedByProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "publishedAt" TIMESTAMPTZ(3) NOT NULL,"occurredAt" TIMESTAMPTZ(3) NOT NULL,"timelineType" TEXT NOT NULL,
 "specialtyId" UUID REFERENCES "Specialty"("id") ON DELETE RESTRICT,"modality" TEXT CHECK ("modality" IN ('onsite','remote')),
 "projectionEncrypted" TEXT,"importedOriginEncrypted" TEXT,
 "revokedAt" TIMESTAMPTZ(3),"revokedByProfessionalId" UUID REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,"revocationReasonEncrypted" TEXT,
 CHECK (("resourceType"='ClinicalDocument' AND "visibilityKind"='document' AND "projectionEncrypted" IS NULL) OR ("resourceType"='ExamResult' AND "visibilityKind"='result' AND "projectionEncrypted" IS NULL) OR ("resourceType"='ClinicalEvolution' AND "visibilityKind" IN ('orientation','confirmed_summary') AND "projectionEncrypted" IS NOT NULL)),
 CHECK ("publishedAt">="occurredAt"),
 CHECK (("revokedAt" IS NULL AND "revokedByProfessionalId" IS NULL AND "revocationReasonEncrypted" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedByProfessionalId" IS NOT NULL AND "revokedAt">="publishedAt" AND "revokedByProfessionalId"="publishedByProfessionalId" AND "revocationReasonEncrypted" IS NOT NULL))
);
CREATE UNIQUE INDEX "PatientPublication_one_active" ON "PatientPublication"("resourceType","resourceId","visibilityKind") WHERE "revokedAt" IS NULL;
CREATE INDEX "PatientPublication_patientId_occurredAt_id_idx" ON "PatientPublication"("patientId","occurredAt","id");
CREATE INDEX "PatientPublication_resourceType_resourceId_visibilityKind_idx" ON "PatientPublication"("resourceType","resourceId","visibilityKind");
CREATE FUNCTION protect_patient_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL OR
   (to_jsonb(NEW)-ARRAY['revokedAt','revokedByProfessionalId','revocationReasonEncrypted']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revokedAt','revokedByProfessionalId','revocationReasonEncrypted']) THEN RAISE EXCEPTION 'Publication only permits one append of revocation metadata'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Publication history is retained'; END IF;
 IF NEW."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Publication starts active'; END IF;
 IF NEW."resourceType"='ClinicalDocument' THEN
  IF NOT EXISTS(SELECT 1 FROM "ClinicalDocument" d JOIN "ClinicalRecord" r ON r."id"=d."recordId" WHERE d."id"=NEW."resourceId" AND r."patientId"=NEW."patientId" AND d."authorProfessionalId"=NEW."publishedByProfessionalId" AND d."status" IN ('issued_dev','issued_valid') AND d."issuedAt"=NEW."occurredAt") THEN RAISE EXCEPTION 'Publication requires own issued document and matching patient/date'; END IF;
 ELSIF NEW."resourceType"='ExamResult' THEN
  IF NOT EXISTS(SELECT 1 FROM "ExamResult" e JOIN "ClinicalRecord" r ON r."id"=e."recordId" WHERE e."id"=NEW."resourceId" AND r."patientId"=NEW."patientId" AND e."receivedAt"=NEW."occurredAt") THEN RAISE EXCEPTION 'Publication requires matching result'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "ClinicalEvolution" e JOIN "ClinicalEncounter" c ON c."id"=e."encounterId" JOIN "ClinicalRecord" r ON r."id"=c."recordId" WHERE e."id"=NEW."resourceId" AND r."patientId"=NEW."patientId" AND e."authorProfessionalId"=NEW."publishedByProfessionalId" AND e."status"='finalized' AND e."finalizedAt"=NEW."occurredAt") THEN RAISE EXCEPTION 'Publication requires own finalized evolution'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PatientPublication_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "PatientPublication" FOR EACH ROW EXECUTE FUNCTION protect_patient_publication();
CREATE TRIGGER "PatientPublication_no_truncate" BEFORE TRUNCATE ON "PatientPublication" FOR EACH STATEMENT EXECUTE FUNCTION protect_patient_publication();
