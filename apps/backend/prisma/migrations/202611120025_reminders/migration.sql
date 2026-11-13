CREATE TABLE "ReminderJob" (
  "id" UUID NOT NULL PRIMARY KEY,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE RESTRICT,
  "appointmentVersion" INTEGER NOT NULL CHECK ("appointmentVersion" > 0),
  "hoursBefore" DOUBLE PRECISION NOT NULL CHECK ("hoursBefore" > 0 AND "hoursBefore" < 'Infinity'::float8),
  "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','enqueued','completed','cancelled','suppressed','failed','skipped')),
  "firstSuccessfulAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReminderJob_appointmentId_appointmentVersion_hoursBefore_key" ON "ReminderJob"("appointmentId","appointmentVersion","hoursBefore");
CREATE INDEX "ReminderJob_status_scheduledAt_id_idx" ON "ReminderJob"("status","scheduledAt","id");
ALTER TABLE "Notification" ADD COLUMN "reminderJobId" UUID REFERENCES "ReminderJob"("id") ON DELETE RESTRICT;
CREATE INDEX "Notification_reminderJobId_idx" ON "Notification"("reminderJobId");
CREATE TABLE "AttendanceResponse" (
  "sequence" BIGSERIAL NOT NULL UNIQUE,
  "id" UUID NOT NULL PRIMARY KEY,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE RESTRICT,
  "appointmentVersion" INTEGER NOT NULL CHECK ("appointmentVersion" > 0),
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "response" TEXT NOT NULL CHECK ("response" IN ('confirm','cannot_attend')),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AttendanceResponse_appointmentId_appointmentVersion_occurredAt_id_idx" ON "AttendanceResponse"("appointmentId","appointmentVersion","occurredAt","id");
CREATE TRIGGER attendance_response_immutable BEFORE UPDATE OR DELETE ON "AttendanceResponse" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE TRIGGER reminder_no_delete BEFORE DELETE ON "ReminderJob" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE FUNCTION preserve_reminder_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."appointmentId",NEW."appointmentVersion",NEW."hoursBefore",NEW."scheduledAt",NEW."createdAt") IS DISTINCT FROM
     (OLD."appointmentId",OLD."appointmentVersion",OLD."hoursBefore",OLD."scheduledAt",OLD."createdAt") OR
     (OLD."firstSuccessfulAt" IS NOT NULL AND NEW."firstSuccessfulAt" IS DISTINCT FROM OLD."firstSuccessfulAt") THEN
    RAISE EXCEPTION 'Reminder history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reminder_history BEFORE UPDATE ON "ReminderJob" FOR EACH ROW EXECUTE FUNCTION preserve_reminder_plan();
