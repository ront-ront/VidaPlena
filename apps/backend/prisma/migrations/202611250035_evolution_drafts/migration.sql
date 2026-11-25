CREATE TABLE "ClinicalEvolution" (
 "id" UUID PRIMARY KEY, "encounterId" UUID NOT NULL UNIQUE REFERENCES "ClinicalEncounter"("id") ON DELETE RESTRICT,
 "authorProfessionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','finalized')),
 "payloadEncrypted" TEXT NOT NULL CHECK (length("payloadEncrypted")>0), "draftVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("draftVersion">0),
 "savedAt" TIMESTAMPTZ(3) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL,
 "finalizedAt" TIMESTAMPTZ(3), "contentHash" TEXT,
 CHECK ("savedAt">="createdAt"),
 CHECK (("status"='draft' AND "finalizedAt" IS NULL AND "contentHash" IS NULL) OR
        ("status"='finalized' AND "finalizedAt" IS NOT NULL AND "finalizedAt">="savedAt" AND "contentHash" ~ '^[a-f0-9]{64}$' AND "contentHash" IS NOT NULL))
);
CREATE INDEX "ClinicalEvolution_authorProfessionalId_status_finalizedAt_id_idx" ON "ClinicalEvolution"("authorProfessionalId","status","finalizedAt","id");
CREATE TABLE "EvolutionDraftCommand" (
 "requestKey" UUID PRIMARY KEY, "actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "evolutionId" UUID NOT NULL REFERENCES "ClinicalEvolution"("id") ON DELETE RESTRICT,
 "inputFingerprint" TEXT NOT NULL CHECK ("inputFingerprint" ~ '^[a-f0-9]{64}$'),
 "resultVersion" INTEGER NOT NULL CHECK ("resultVersion">1),
 "resultSavedAt" TIMESTAMPTZ(3) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "EvolutionDraftCommand_evolutionId_resultVersion_idx" ON "EvolutionDraftCommand"("evolutionId","resultVersion");
CREATE FUNCTION protect_clinical_evolution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p UUID;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical evolution preserves history'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."status"='finalized' THEN RAISE EXCEPTION 'Finalized evolution is immutable'; END IF;
  IF ROW(NEW."id",NEW."encounterId",NEW."authorProfessionalId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."encounterId",OLD."authorProfessionalId",OLD."createdAt") THEN RAISE EXCEPTION 'Evolution identity is immutable'; END IF;
  IF NEW."status"='draft' AND NEW."draftVersion"<>OLD."draftVersion"+1 THEN RAISE EXCEPTION 'Draft version must advance once'; END IF;
  IF NEW."status"='finalized' AND ROW(NEW."payloadEncrypted",NEW."draftVersion",NEW."savedAt") IS DISTINCT FROM ROW(OLD."payloadEncrypted",OLD."draftVersion",OLD."savedAt") THEN RAISE EXCEPTION 'Finalization must preserve saved draft'; END IF;
 END IF;
 SELECT "professionalId" INTO p FROM "ClinicalEncounter" WHERE "id"=NEW."encounterId";
 IF NEW."authorProfessionalId" IS DISTINCT FROM p THEN RAISE EXCEPTION 'Evolution author must own encounter'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalEvolution_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "ClinicalEvolution" FOR EACH ROW EXECUTE FUNCTION protect_clinical_evolution();
CREATE TRIGGER "EvolutionDraftCommand_immutable" BEFORE UPDATE OR DELETE ON "EvolutionDraftCommand" FOR EACH ROW EXECUTE FUNCTION protect_clinical_record();
CREATE FUNCTION check_evolution_draft_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "ClinicalEvolution" e JOIN "ProfessionalProfile" p ON p."id"=e."authorProfessionalId" WHERE e."id"=NEW."evolutionId" AND p."userId"=NEW."actorId" AND e."status"='draft' AND e."draftVersion"=NEW."resultVersion" AND e."savedAt"=NEW."resultSavedAt") THEN RAISE EXCEPTION 'Draft command result mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "EvolutionDraftCommand_integrity" BEFORE INSERT ON "EvolutionDraftCommand" FOR EACH ROW EXECUTE FUNCTION check_evolution_draft_command();

ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_closed_time" CHECK ("status"<>'completed' OR "endedAt" IS NOT NULL);
