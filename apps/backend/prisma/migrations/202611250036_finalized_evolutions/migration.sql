ALTER TABLE "ClinicalEvolution" ADD COLUMN "integrityVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("integrityVersion">0);
CREATE TABLE "EvolutionAddendum" (
 "id" UUID PRIMARY KEY, "originalEvolutionId" UUID NOT NULL REFERENCES "ClinicalEvolution"("id") ON DELETE RESTRICT,
 "authorProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "contentEncrypted" TEXT NOT NULL, "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
 "createdAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "EvolutionAddendum_originalEvolutionId_createdAt_id_idx" ON "EvolutionAddendum"("originalEvolutionId","createdAt","id");
CREATE TABLE "ClinicalRetentionEvent" (
 "id" UUID PRIMARY KEY, "recordId" UUID NOT NULL REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT,
 "encounterId" UUID NOT NULL UNIQUE REFERENCES "ClinicalEncounter"("id") ON DELETE RESTRICT,
 "anchorAt" TIMESTAMPTZ(3) NOT NULL, "retentionYears" INTEGER NOT NULL CHECK ("retentionYears">=20),
 "retainUntil" TIMESTAMPTZ(3) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK ("retainUntil">=(("anchorAt" AT TIME ZONE 'UTC')+make_interval(years=>"retentionYears")) AT TIME ZONE 'UTC')
);
CREATE INDEX "ClinicalRetentionEvent_recordId_retainUntil_idx" ON "ClinicalRetentionEvent"("recordId","retainUntil");
CREATE TRIGGER "EvolutionAddendum_immutable" BEFORE UPDATE OR DELETE ON "EvolutionAddendum" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalRetentionEvent_immutable" BEFORE UPDATE OR DELETE ON "ClinicalRetentionEvent" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION check_evolution_addendum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "ClinicalEvolution" WHERE "id"=NEW."originalEvolutionId" AND "status"='finalized' AND "authorProfessionalId"=NEW."authorProfessionalId") THEN RAISE EXCEPTION 'Addendum requires finalized original and same author'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "EvolutionAddendum_author" BEFORE INSERT ON "EvolutionAddendum" FOR EACH ROW EXECUTE FUNCTION check_evolution_addendum();
CREATE FUNCTION check_clinical_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "ClinicalEncounter" WHERE "id"=NEW."encounterId" AND "recordId"=NEW."recordId" AND "status"='completed' AND "endedAt"=NEW."anchorAt") THEN RAISE EXCEPTION 'Retention anchor must match completed encounter'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalRetentionEvent_anchor" BEFORE INSERT ON "ClinicalRetentionEvent" FOR EACH ROW EXECUTE FUNCTION check_clinical_retention();
CREATE FUNCTION protect_evolution_file() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "ClinicalEvolution"%ROWTYPE; p UUID;
BEGIN
 IF TG_OP<>'INSERT' AND OLD."linkedResourceType"='ClinicalEvolution' THEN
  SELECT * INTO e FROM "ClinicalEvolution" WHERE "id"::text=OLD."linkedResourceId" FOR UPDATE;
  IF e."status"='finalized' THEN RAISE EXCEPTION 'Finalized evolution file is immutable'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND NEW."linkedResourceType"='ClinicalEvolution' THEN
  SELECT * INTO e FROM "ClinicalEvolution" WHERE "id"::text=NEW."linkedResourceId" FOR UPDATE;
  IF NOT FOUND OR e."status"<>'draft' THEN RAISE EXCEPTION 'Files may only attach to an existing draft'; END IF;
  SELECT r."patientId" INTO p FROM "ClinicalEncounter" c JOIN "ClinicalRecord" r ON r."id"=c."recordId" WHERE c."id"=e."encounterId";
  IF NEW."ownerPatientId" IS DISTINCT FROM p OR NEW."category"<>'attachment' THEN RAISE EXCEPTION 'Evolution file subject mismatch'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FileObject_evolution_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "FileObject" FOR EACH ROW EXECUTE FUNCTION protect_evolution_file();
ALTER TABLE "SlotReleaseEvent" DROP CONSTRAINT "SlotReleaseEvent_kind_check";
ALTER TABLE "SlotReleaseEvent" ADD CONSTRAINT "SlotReleaseEvent_kind_check" CHECK ("kind" IN ('cancelled','rescheduled','completed'));

CREATE TRIGGER "ClinicalEvolution_no_truncate" BEFORE TRUNCATE ON "ClinicalEvolution" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "EvolutionAddendum_no_truncate" BEFORE TRUNCATE ON "EvolutionAddendum" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalRetentionEvent_no_truncate" BEFORE TRUNCATE ON "ClinicalRetentionEvent" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
