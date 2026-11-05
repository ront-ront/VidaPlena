CREATE TABLE "ScheduleVersion" (
  "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version">0), "clinicTimeZone" TEXT NOT NULL,
  "publishedBy" UUID NOT NULL REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("professionalId","version")
);
CREATE TABLE "AvailabilityRule" (
  "id" UUID PRIMARY KEY,"professionalId" UUID NOT NULL,"publishedVersion" INTEGER NOT NULL,
  "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 1 AND 7),
  "localStart" TEXT NOT NULL CHECK ("localStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "localEnd" TEXT NOT NULL CHECK ("localEnd" ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'),
  "effectiveFrom" DATE NOT NULL,"effectiveTo" DATE,
  "modality" "AppointmentModality" NOT NULL,
  FOREIGN KEY ("professionalId","publishedVersion") REFERENCES "ScheduleVersion"("professionalId","version") ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK ("localStart" < "localEnd"), CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom")
);
CREATE INDEX "AvailabilityRule_professionalId_publishedVersion_weekday_idx" ON "AvailabilityRule"("professionalId","publishedVersion","weekday");
CREATE TABLE "ScheduleBlock" (
  "id" UUID PRIMARY KEY,"professionalId" UUID NOT NULL,"publishedVersion" INTEGER NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,"endsAt" TIMESTAMPTZ(3) NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('break','vacation','holiday','emergency')),"reason" TEXT NOT NULL CHECK(length(btrim("reason"))>0),
  FOREIGN KEY ("professionalId","publishedVersion") REFERENCES "ScheduleVersion"("professionalId","version") ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK ("startsAt"<"endsAt")
);
CREATE INDEX "ScheduleBlock_professionalId_publishedVersion_startsAt_endsAt_idx" ON "ScheduleBlock"("professionalId","publishedVersion","startsAt","endsAt");
CREATE FUNCTION preserve_schedule_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published schedule snapshots are immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER schedule_version_immutable BEFORE UPDATE OR DELETE ON "ScheduleVersion" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE TRIGGER availability_rule_immutable BEFORE UPDATE OR DELETE ON "AvailabilityRule" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE TRIGGER schedule_block_immutable BEFORE UPDATE OR DELETE ON "ScheduleBlock" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
