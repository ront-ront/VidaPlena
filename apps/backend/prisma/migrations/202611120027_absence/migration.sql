ALTER TABLE "PatientProfile" ADD COLUMN "autoBookingPolicyVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "Absence" (
 "id" UUID PRIMARY KEY,
 "appointmentId" UUID NOT NULL UNIQUE REFERENCES "Appointment"("id") ON DELETE RESTRICT,
 "appointmentVersion" INTEGER NOT NULL CHECK ("appointmentVersion">0),
 "patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "occurredAt" TIMESTAMPTZ(3) NOT NULL,
 "penaltyExpiresAt" TIMESTAMPTZ(3) NOT NULL CHECK ("penaltyExpiresAt">"occurredAt"),
 "clinicTimeZone" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('unjustified','justified','clinic_fault')),
 "explanationEncrypted" TEXT,
 "recordedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "recordedAt" TIMESTAMPTZ(3) NOT NULL,
 "decidedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "decidedAt" TIMESTAMPTZ(3) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0),
 CHECK ("kind"='unjustified' OR "explanationEncrypted" IS NOT NULL)
);
CREATE INDEX "Absence_patientId_kind_penaltyExpiresAt_idx" ON "Absence"("patientId","kind","penaltyExpiresAt");
CREATE TABLE "AbsenceRevision" (
 "id" UUID PRIMARY KEY,
 "absenceId" UUID NOT NULL REFERENCES "Absence"("id") ON DELETE RESTRICT,
 "version" INTEGER NOT NULL CHECK ("version">0),
 "previousKind" TEXT CHECK ("previousKind" IN ('unjustified','justified','clinic_fault')),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('unjustified','justified','clinic_fault')),
 "explanationEncrypted" TEXT,
 "actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "occurredAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "AbsenceRevision_absenceId_version_key" ON "AbsenceRevision"("absenceId","version");
CREATE TRIGGER absence_no_delete BEFORE DELETE ON "Absence" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE TRIGGER absence_revision_immutable BEFORE UPDATE OR DELETE ON "AbsenceRevision" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE FUNCTION preserve_absence_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW."id",NEW."appointmentId",NEW."appointmentVersion",NEW."patientId",NEW."occurredAt",NEW."penaltyExpiresAt",NEW."clinicTimeZone",NEW."recordedBy",NEW."recordedAt") IS DISTINCT FROM
 (OLD."id",OLD."appointmentId",OLD."appointmentVersion",OLD."patientId",OLD."occurredAt",OLD."penaltyExpiresAt",OLD."clinicTimeZone",OLD."recordedBy",OLD."recordedAt") OR NEW."version"<>OLD."version"+1 THEN
 RAISE EXCEPTION 'Absence origin is immutable; corrections require a new revision' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER absence_origin BEFORE UPDATE ON "Absence" FOR EACH ROW EXECUTE FUNCTION preserve_absence_origin();
CREATE FUNCTION check_absence_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; a "Absence"%ROWTYPE; p "Appointment"%ROWTYPE; r "AbsenceRevision"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='Appointment' THEN target:=NEW."id";
 ELSIF TG_TABLE_NAME='AbsenceRevision' THEN SELECT "appointmentId" INTO target FROM "Absence" WHERE "id"=NEW."absenceId";
 ELSE target:=NEW."appointmentId"; END IF;
 SELECT * INTO a FROM "Absence" WHERE "appointmentId"=target;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM "Appointment" WHERE "id"=target;
 SELECT * INTO r FROM "AbsenceRevision" WHERE "absenceId"=a."id" ORDER BY "version" DESC LIMIT 1;
 IF p."status"<>'no_show' OR p."patientId"<>a."patientId" OR p."version"<>a."appointmentVersion" OR p."startsAt"<>a."occurredAt" OR
 EXISTS(SELECT 1 FROM "CheckIn" c WHERE c."appointmentId"=target AND c."appointmentVersion" IN (a."appointmentVersion",a."appointmentVersion"-1)) OR
 r."id" IS NULL OR r."version"<>a."version" OR r."kind"<>a."kind" OR r."explanationEncrypted" IS DISTINCT FROM a."explanationEncrypted" OR r."actorId"<>a."decidedBy" OR r."occurredAt"<>a."decidedAt" THEN
 RAISE EXCEPTION 'Absence, appointment and revision must agree' USING ERRCODE='23514'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER absence_consistency AFTER INSERT OR UPDATE ON "Absence" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_absence_consistency();
CREATE CONSTRAINT TRIGGER absence_revision_consistency AFTER INSERT ON "AbsenceRevision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_absence_consistency();
CREATE CONSTRAINT TRIGGER absence_appointment_consistency AFTER UPDATE ON "Appointment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_absence_consistency();
CREATE CONSTRAINT TRIGGER absence_checkin_consistency AFTER INSERT ON "CheckIn" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_absence_consistency();
