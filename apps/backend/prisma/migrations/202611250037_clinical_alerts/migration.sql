CREATE TABLE "ClinicalAlert" (
 "id" UUID PRIMARY KEY, "patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('allergy','condition','continuous_medication','other')),
 "payloadEncrypted" TEXT NOT NULL, "verificationState" TEXT NOT NULL CHECK ("verificationState" IN ('reported','confirmed')),
 "authorProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT, "createdAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "ClinicalAlert_patientId_createdAt_id_idx" ON "ClinicalAlert"("patientId","createdAt","id");
CREATE TABLE "ClinicalAlertEvent" (
 "id" UUID PRIMARY KEY, "alertId" UUID NOT NULL REFERENCES "ClinicalAlert"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('created','confirmed','deactivated')), "version" INTEGER NOT NULL CHECK ("version">0),
 "authorProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "reasonEncrypted" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK (("kind"='deactivated')=("reasonEncrypted" IS NOT NULL)),
 CONSTRAINT "ClinicalAlertEvent_alertId_version_key" UNIQUE("alertId","version")
);
CREATE FUNCTION check_clinical_alert_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "ClinicalAlert"%ROWTYPE; previous "ClinicalAlertEvent"%ROWTYPE;
BEGIN
 SELECT * INTO a FROM "ClinicalAlert" WHERE "id"=NEW."alertId" FOR UPDATE;
 SELECT * INTO previous FROM "ClinicalAlertEvent" WHERE "alertId"=NEW."alertId" ORDER BY "version" DESC LIMIT 1;
 IF previous."id" IS NULL THEN
  IF NEW."kind"<>'created' OR NEW."version"<>1 OR NEW."authorProfessionalId"<>a."authorProfessionalId" OR NEW."createdAt"<>a."createdAt" THEN RAISE EXCEPTION 'Alert must start with author creation'; END IF;
 ELSE
  IF NEW."version"<>previous."version"+1 OR NEW."createdAt"<previous."createdAt" OR NEW."kind"='created' OR previous."kind"='deactivated' THEN RAISE EXCEPTION 'Invalid alert transition'; END IF;
  IF NEW."kind"='confirmed' AND (a."verificationState"='confirmed' OR previous."kind"='confirmed') THEN RAISE EXCEPTION 'Alert already confirmed'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalAlertEvent_transition" BEFORE INSERT ON "ClinicalAlertEvent" FOR EACH ROW EXECUTE FUNCTION check_clinical_alert_event();
CREATE TRIGGER "ClinicalAlert_immutable" BEFORE UPDATE OR DELETE ON "ClinicalAlert" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalAlertEvent_immutable" BEFORE UPDATE OR DELETE ON "ClinicalAlertEvent" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalAlert_no_truncate" BEFORE TRUNCATE ON "ClinicalAlert" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalAlertEvent_no_truncate" BEFORE TRUNCATE ON "ClinicalAlertEvent" FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION require_clinical_alert_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ClinicalAlertEvent" WHERE "alertId"=NEW."id" AND "kind"='created' AND "version"=1) THEN RAISE EXCEPTION 'Alert requires creation event'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ClinicalAlert_requires_event" AFTER INSERT ON "ClinicalAlert" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_clinical_alert_creation();
