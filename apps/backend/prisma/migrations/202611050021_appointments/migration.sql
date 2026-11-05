CREATE TYPE "AppointmentStatus" AS ENUM ('confirmed','waiting','in_service','completed','no_show','cancelled');
ALTER TABLE "PatientProfile" ADD COLUMN "autoBookingSuspendedUntil" TIMESTAMPTZ(3);
ALTER TABLE "Notification" ADD COLUMN "aggregateId" TEXT, ADD COLUMN "aggregateVersion" INTEGER;
CREATE INDEX "Notification_aggregateId_aggregateVersion_idx" ON "Notification"("aggregateId","aggregateVersion");
CREATE TABLE "Appointment" (
  "id" UUID PRIMARY KEY,"patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "specialtyId" UUID NOT NULL REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "roomId" UUID REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "modality" "AppointmentModality" NOT NULL,"visitType" TEXT NOT NULL CHECK ("visitType" IN ('first','return')),
  "startsAt" TIMESTAMPTZ(3) NOT NULL,"endsAt" TIMESTAMPTZ(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes">0),"specialtyVersion" INTEGER NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'confirmed',"version" INTEGER NOT NULL DEFAULT 1,
  "bookingSource" TEXT NOT NULL CHECK ("bookingSource" IN ('portal','reception','fit_in','imported')),
  "createdBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "parentAppointmentId" UUID REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT,"notificationAttention" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CHECK ("endsAt"="startsAt"+make_interval(mins=>"durationMinutes")),
  CHECK (("modality"='onsite' AND "roomId" IS NOT NULL) OR ("modality"='remote' AND "roomId" IS NULL))
);
CREATE INDEX "Appointment_professionalId_startsAt_status_idx" ON "Appointment"("professionalId","startsAt","status");
CREATE INDEX "Appointment_roomId_startsAt_status_idx" ON "Appointment"("roomId","startsAt","status");
CREATE INDEX "Appointment_patientId_specialtyId_startsAt_status_idx" ON "Appointment"("patientId","specialtyId","startsAt","status");
CREATE INDEX "Appointment_startsAt_status_id_idx" ON "Appointment"("startsAt","status","id");
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE "AppointmentHistory" (
  "id" UUID PRIMARY KEY,"appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" TEXT NOT NULL,"previous" JSONB,"next" JSONB NOT NULL,
  "actorUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,"reason" TEXT,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AppointmentHistory_appointmentId_occurredAt_id_idx" ON "AppointmentHistory"("appointmentId","occurredAt","id");
CREATE TABLE "BookingCommand" (
  "requestKey" TEXT PRIMARY KEY,"actorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "operation" TEXT NOT NULL,"inputHash" TEXT NOT NULL,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BookingCommand_appointmentId_idx" ON "BookingCommand"("appointmentId");
CREATE TRIGGER appointment_no_delete BEFORE DELETE ON "Appointment" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE TRIGGER appointment_history_immutable BEFORE UPDATE OR DELETE ON "AppointmentHistory" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE TRIGGER booking_command_immutable BEFORE UPDATE OR DELETE ON "BookingCommand" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
CREATE FUNCTION check_appointment_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; appt "Appointment"%ROWTYPE; occupied_count INTEGER; matching_count INTEGER;
BEGIN
  IF TG_TABLE_NAME='Appointment' THEN target:=NEW."id"; ELSE target:=NEW."appointmentId"; END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO appt FROM "Appointment" WHERE "id"=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*),count(*) FILTER (WHERE "professionalId"=appt."professionalId" AND "roomId" IS NOT DISTINCT FROM appt."roomId" AND "modality"=appt."modality" AND "startsAt"=appt."startsAt" AND "endsAt"=appt."endsAt")
    INTO occupied_count,matching_count FROM "SlotReservation" WHERE "appointmentId"=target AND "state"='confirmed';
  IF (appt."status" IN ('confirmed','waiting','in_service') AND (occupied_count<>1 OR matching_count<>1))
    OR (appt."status" NOT IN ('confirmed','waiting','in_service') AND occupied_count<>0) THEN
    RAISE EXCEPTION 'Appointment and reservation must commit consistently' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER appointment_reservation_consistency AFTER INSERT OR UPDATE ON "Appointment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_appointment_reservation();
CREATE CONSTRAINT TRIGGER reservation_appointment_consistency AFTER INSERT OR UPDATE ON "SlotReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_appointment_reservation();
