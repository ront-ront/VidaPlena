CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE "SlotReservation" (
  "id" UUID PRIMARY KEY,"professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "roomId" UUID REFERENCES "Room"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "modality" "AppointmentModality" NOT NULL,"startsAt" TIMESTAMPTZ(3) NOT NULL,"endsAt" TIMESTAMPTZ(3) NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('held','confirmed','released')),
  "appointmentId" UUID,"offerId" UUID,"expiresAt" TIMESTAMPTZ(3),
  "requestKey" TEXT NOT NULL UNIQUE,"requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("startsAt"<"endsAt"),
  CHECK (("modality"='onsite' AND "roomId" IS NOT NULL) OR ("modality"='remote' AND "roomId" IS NULL)),
  CHECK ("state"<>'held' OR ("expiresAt" IS NOT NULL AND "appointmentId" IS NULL)),
  CHECK ("state"<>'confirmed' OR ("appointmentId" IS NOT NULL AND "expiresAt" IS NULL)),
  CONSTRAINT "reservation_professional_no_overlap" EXCLUDE USING gist ("professionalId" WITH =,tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE ("state" IN ('held','confirmed')),
  CONSTRAINT "reservation_room_no_overlap" EXCLUDE USING gist ("roomId" WITH =,tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE ("roomId" IS NOT NULL AND "state" IN ('held','confirmed'))
);
CREATE UNIQUE INDEX "SlotReservation_confirmed_appointment_key" ON "SlotReservation"("appointmentId") WHERE "state"='confirmed';
CREATE INDEX "SlotReservation_professionalId_startsAt_endsAt_idx" ON "SlotReservation"("professionalId","startsAt","endsAt");
CREATE INDEX "SlotReservation_roomId_startsAt_endsAt_idx" ON "SlotReservation"("roomId","startsAt","endsAt");
CREATE INDEX "SlotReservation_state_expiresAt_idx" ON "SlotReservation"("state","expiresAt");
CREATE INDEX "SlotReservation_appointmentId_state_idx" ON "SlotReservation"("appointmentId","state");
CREATE FUNCTION protect_reservation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservations must be released, never deleted' USING ERRCODE='23514'; END IF;
  IF (NEW."professionalId",NEW."roomId",NEW."modality",NEW."startsAt",NEW."endsAt",NEW."requestKey",NEW."requestHash") IS DISTINCT FROM (OLD."professionalId",OLD."roomId",OLD."modality",OLD."startsAt",OLD."endsAt",OLD."requestKey",OLD."requestHash")
    OR (OLD."state"='released' AND NEW."state"<>'released')
    OR (OLD."appointmentId" IS NOT NULL AND NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId")
    OR (NEW."offerId" IS DISTINCT FROM OLD."offerId")
    OR (OLD."state"='held' AND NEW."state"='held' AND NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt")
    OR (OLD."state"='confirmed' AND NEW."state" NOT IN ('confirmed','released')) THEN
    RAISE EXCEPTION 'Reservation resources and history are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reservation_history BEFORE UPDATE OR DELETE ON "SlotReservation" FOR EACH ROW EXECUTE FUNCTION protect_reservation_history();
