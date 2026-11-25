CREATE TABLE "TerminologyCatalog" (
 "id" UUID PRIMARY KEY, "terminology" TEXT NOT NULL CHECK ("terminology" IN ('CID10','TUSS')),
 "version" TEXT NOT NULL, "source" TEXT NOT NULL, "license" TEXT NOT NULL, "demo" BOOLEAN NOT NULL,
 "checksum" TEXT NOT NULL CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
 "loadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("terminology","version")
);
CREATE TABLE "TerminologySelection" (
 "terminology" TEXT PRIMARY KEY CHECK ("terminology" IN ('CID10','TUSS')),
 "catalogId" UUID NOT NULL REFERENCES "TerminologyCatalog"("id") ON DELETE RESTRICT
);
CREATE TABLE "DiagnosisCode" (
 "id" UUID PRIMARY KEY, "catalogId" UUID NOT NULL REFERENCES "TerminologyCatalog"("id") ON DELETE RESTRICT,
 "code" TEXT NOT NULL, "description" TEXT NOT NULL, "searchText" TEXT NOT NULL, "active" BOOLEAN NOT NULL,
 UNIQUE ("catalogId","code")
);
CREATE TABLE "ProcedureCode" (
 "id" UUID PRIMARY KEY, "catalogId" UUID NOT NULL REFERENCES "TerminologyCatalog"("id") ON DELETE RESTRICT,
 "code" TEXT NOT NULL, "description" TEXT NOT NULL, "searchText" TEXT NOT NULL, "active" BOOLEAN NOT NULL,
 UNIQUE ("catalogId","code")
);
CREATE INDEX "DiagnosisCode_catalogId_active_code_id_idx" ON "DiagnosisCode"("catalogId","active","code","id");
CREATE INDEX "ProcedureCode_catalogId_active_code_id_idx" ON "ProcedureCode"("catalogId","active","code","id");
CREATE FUNCTION protect_terminology_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Terminology versions are immutable'; END $$;
CREATE TRIGGER "TerminologyCatalog_immutable" BEFORE UPDATE OR DELETE ON "TerminologyCatalog" FOR EACH ROW EXECUTE FUNCTION protect_terminology_catalog();
CREATE TRIGGER "DiagnosisCode_immutable" BEFORE UPDATE OR DELETE ON "DiagnosisCode" FOR EACH ROW EXECUTE FUNCTION protect_terminology_catalog();
CREATE TRIGGER "ProcedureCode_immutable" BEFORE UPDATE OR DELETE ON "ProcedureCode" FOR EACH ROW EXECUTE FUNCTION protect_terminology_catalog();
CREATE FUNCTION check_terminology_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "TerminologyCatalog" WHERE "id"=NEW."catalogId" AND "terminology"=NEW."terminology") THEN RAISE EXCEPTION 'Terminology selection mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TerminologySelection_kind" BEFORE INSERT OR UPDATE ON "TerminologySelection" FOR EACH ROW EXECUTE FUNCTION check_terminology_selection();
