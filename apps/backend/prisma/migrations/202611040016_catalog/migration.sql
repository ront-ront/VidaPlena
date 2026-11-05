CREATE TYPE "AppointmentModality" AS ENUM ('onsite', 'remote');
CREATE TABLE "Specialty" (
  "id" UUID PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "allowedModalities" "AppointmentModality"[] NOT NULL,
  "defaultMinutesFirst" INTEGER NOT NULL CHECK ("defaultMinutesFirst" > 0),
  "defaultMinutesReturn" INTEGER NOT NULL CHECK ("defaultMinutesReturn" > 0),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CHECK (cardinality("allowedModalities") > 0)
);
CREATE INDEX "Specialty_active_id_idx" ON "Specialty"("active","id");
CREATE TABLE "ProfessionalProfile" (
  "id" UUID PRIMARY KEY, "userId" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "councilType" TEXT NOT NULL CHECK ("councilType" ~ '^[A-Z]{2,12}$'),
  "councilNumber" TEXT NOT NULL CHECK ("councilNumber" ~ '^[A-Z0-9]{1,30}$'),
  "councilRegion" TEXT NOT NULL CHECK ("councilRegion" ~ '^[A-Z]{2}$'),
  "active" BOOLEAN NOT NULL DEFAULT true, "modalities" "AppointmentModality"[] NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProfessionalProfile_councilType_councilRegion_councilNumber_key" UNIQUE ("councilType","councilRegion","councilNumber"),
  CHECK (cardinality("modalities") > 0)
);
CREATE INDEX "ProfessionalProfile_active_id_idx" ON "ProfessionalProfile"("active","id");
CREATE TABLE "ProfessionalSpecialty" (
  "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "specialtyId" UUID NOT NULL REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "active" BOOLEAN NOT NULL DEFAULT true, "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("professionalId","specialtyId")
);
CREATE INDEX "ProfessionalSpecialty_specialtyId_active_idx" ON "ProfessionalSpecialty"("specialtyId","active");
CREATE FUNCTION preserve_catalog_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Catalog entries must be inactivated, never deleted' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER specialty_no_delete BEFORE DELETE ON "Specialty" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE TRIGGER professional_no_delete BEFORE DELETE ON "ProfessionalProfile" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE TRIGGER professional_specialty_no_delete BEFORE DELETE ON "ProfessionalSpecialty" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
