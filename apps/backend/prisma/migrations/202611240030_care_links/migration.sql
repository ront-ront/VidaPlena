CREATE TABLE "CareLink" (
 "id" UUID PRIMARY KEY, "patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "source" TEXT NOT NULL CHECK ("source" IN ('appointment','shared_case','substitution')),
 "sourceAppointmentId" UUID REFERENCES "Appointment"("id") ON DELETE RESTRICT,
 "appointmentVersion" INTEGER, "parentLinkId" UUID REFERENCES "CareLink"("id") ON DELETE RESTRICT,
 "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','revoked')),
 "grantedBy" UUID REFERENCES "User"("id") ON DELETE RESTRICT, "reasonEncrypted" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMPTZ(3),
 CONSTRAINT "CareLink_interval" CHECK ("startsAt" < "endsAt"),
 CONSTRAINT "CareLink_origin" CHECK (
  ("source"='appointment' AND "sourceAppointmentId" IS NOT NULL AND "appointmentVersion" IS NOT NULL AND "appointmentVersion">0 AND "parentLinkId" IS NULL) OR
  ("source"='shared_case' AND "sourceAppointmentId" IS NULL AND "parentLinkId" IS NOT NULL AND "grantedBy" IS NOT NULL AND "reasonEncrypted" IS NOT NULL) OR
  ("source"='substitution' AND "sourceAppointmentId" IS NULL AND "parentLinkId" IS NULL AND "grantedBy" IS NOT NULL AND "reasonEncrypted" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "CareLink_sourceAppointmentId_professionalId_key" ON "CareLink"("sourceAppointmentId","professionalId");
CREATE INDEX "CareLink_professionalId_patientId_status_startsAt_endsAt_idx" ON "CareLink"("professionalId","patientId","status","startsAt","endsAt");
CREATE INDEX "CareLink_parentLinkId_idx" ON "CareLink"("parentLinkId");
CREATE FUNCTION protect_care_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Care links preserve history'; END IF;
 IF ROW(NEW."id",NEW."patientId",NEW."professionalId",NEW."source",NEW."sourceAppointmentId",NEW."parentLinkId",NEW."createdAt") IS DISTINCT FROM
    ROW(OLD."id",OLD."patientId",OLD."professionalId",OLD."source",OLD."sourceAppointmentId",OLD."parentLinkId",OLD."createdAt") THEN RAISE EXCEPTION 'Care link identity is immutable'; END IF;
 IF OLD."source" <> 'appointment' AND ROW(NEW."startsAt",NEW."endsAt",NEW."grantedBy",NEW."reasonEncrypted") IS DISTINCT FROM ROW(OLD."startsAt",OLD."endsAt",OLD."grantedBy",OLD."reasonEncrypted") THEN RAISE EXCEPTION 'Temporary grant is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CareLink_immutable" BEFORE UPDATE OR DELETE ON "CareLink" FOR EACH ROW EXECUTE FUNCTION protect_care_link();

CREATE FUNCTION check_care_link_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "CareLink"%ROWTYPE; a "Appointment"%ROWTYPE;
BEGIN
 IF NEW."source"='appointment' THEN
  SELECT * INTO a FROM "Appointment" WHERE "id"=NEW."sourceAppointmentId";
  IF a."patientId"<>NEW."patientId" OR (NEW."status"='active' AND a."professionalId"<>NEW."professionalId") THEN RAISE EXCEPTION 'Care link origin mismatch'; END IF;
 ELSIF NEW."source"='shared_case' THEN
  SELECT * INTO p FROM "CareLink" WHERE "id"=NEW."parentLinkId";
  IF p."source"<>'appointment' OR p."patientId"<>NEW."patientId" OR p."professionalId"=NEW."professionalId" OR NEW."id"=p."id" THEN RAISE EXCEPTION 'Invalid shared care link basis'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CareLink_origin" BEFORE INSERT OR UPDATE ON "CareLink" FOR EACH ROW EXECUTE FUNCTION check_care_link_origin();
