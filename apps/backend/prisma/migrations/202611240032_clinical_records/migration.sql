CREATE TABLE "ClinicalRecord" (
 "id" UUID PRIMARY KEY, "patientId" UUID NOT NULL UNIQUE REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "recordNumber" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ClinicalEncounter" (
 "id" UUID PRIMARY KEY, "appointmentId" UUID NOT NULL UNIQUE REFERENCES "Appointment"("id") ON DELETE RESTRICT,
 "recordId" UUID NOT NULL REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT,
 "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "startedAt" TIMESTAMPTZ(3) NOT NULL, "endedAt" TIMESTAMPTZ(3),
 "status" TEXT NOT NULL DEFAULT 'in_progress' CHECK ("status" IN ('in_progress','completed')),
 CHECK (("status"='in_progress' AND "endedAt" IS NULL) OR ("status"='completed' AND "endedAt">="startedAt"))
);
CREATE INDEX "ClinicalEncounter_recordId_status_startedAt_id_idx" ON "ClinicalEncounter"("recordId","status","startedAt","id");
CREATE TABLE "ClinicalTimelineEntry" (
 "id" UUID PRIMARY KEY, "recordId" UUID NOT NULL REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT,
 "type" TEXT NOT NULL CHECK ("type" IN ('evolution','prescription','exam_order','exam_result','document','imported_history')),
 "resourceId" UUID NOT NULL, "occurredAt" TIMESTAMPTZ(3) NOT NULL,
 "professionalId" UUID REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "specialtyId" UUID REFERENCES "Specialty"("id") ON DELETE RESTRICT,
 "modality" "AppointmentModality", "summaryEncrypted" TEXT NOT NULL, "importedOriginEncrypted" TEXT,
 UNIQUE("type","resourceId")
);
CREATE INDEX "ClinicalTimelineEntry_recordId_occurredAt_id_idx" ON "ClinicalTimelineEntry"("recordId","occurredAt","id");
CREATE INDEX "Appointment_patientId_status_endsAt_id_idx" ON "Appointment"("patientId","status","endsAt","id");
CREATE FUNCTION protect_clinical_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Clinical record identity and timeline preserve history'; END $$;
CREATE TRIGGER "ClinicalRecord_immutable" BEFORE UPDATE OR DELETE ON "ClinicalRecord" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE TRIGGER "ClinicalTimelineEntry_immutable" BEFORE UPDATE OR DELETE ON "ClinicalTimelineEntry" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION protect_clinical_encounter() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "Appointment"%ROWTYPE; p UUID;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical encounter preserves history'; END IF;
 IF TG_OP='UPDATE' AND (OLD."status"='completed' OR ROW(NEW."id",NEW."appointmentId",NEW."recordId",NEW."professionalId",NEW."startedAt") IS DISTINCT FROM ROW(OLD."id",OLD."appointmentId",OLD."recordId",OLD."professionalId",OLD."startedAt")) THEN RAISE EXCEPTION 'Clinical encounter identity is immutable'; END IF;
 SELECT * INTO a FROM "Appointment" WHERE "id"=NEW."appointmentId";
 SELECT "patientId" INTO p FROM "ClinicalRecord" WHERE "id"=NEW."recordId";
 IF a."patientId"<>p OR a."professionalId"<>NEW."professionalId" THEN RAISE EXCEPTION 'Clinical encounter origin mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalEncounter_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "ClinicalEncounter" FOR EACH ROW EXECUTE FUNCTION protect_clinical_encounter();
