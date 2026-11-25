CREATE TABLE "EmergencyAccessGrant" (
 "id" UUID PRIMARY KEY,
 "patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT,
 "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "justificationEncrypted" TEXT NOT NULL CHECK (length("justificationEncrypted")>0),
 "grantedAt" TIMESTAMPTZ(3) NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL CHECK ("expiresAt">"grantedAt")
);
CREATE INDEX "EmergencyAccessGrant_professionalId_patientId_expiresAt_idx" ON "EmergencyAccessGrant"("professionalId","patientId","expiresAt");
CREATE INDEX "EmergencyAccessGrant_grantedAt_id_idx" ON "EmergencyAccessGrant"("grantedAt","id");
CREATE TABLE "EmergencyAccessReview" (
 "id" UUID PRIMARY KEY,
 "grantId" UUID NOT NULL UNIQUE REFERENCES "EmergencyAccessGrant"("id") ON DELETE RESTRICT,
 "reviewerUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "outcome" TEXT NOT NULL CHECK ("outcome" IN ('approved','requires_follow_up','rejected')),
 "notesEncrypted" TEXT NOT NULL CHECK (length("notesEncrypted")>0),
 "reviewedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE FUNCTION protect_emergency_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Emergency access evidence is append-only'; END $$;
CREATE TRIGGER "EmergencyAccessGrant_immutable" BEFORE UPDATE OR DELETE ON "EmergencyAccessGrant" FOR EACH ROW EXECUTE FUNCTION protect_emergency_access();
CREATE TRIGGER "EmergencyAccessReview_immutable" BEFORE UPDATE OR DELETE ON "EmergencyAccessReview" FOR EACH ROW EXECUTE FUNCTION protect_emergency_access();
