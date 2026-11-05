CREATE TABLE "WaitlistEntry" (
  "id" UUID PRIMARY KEY,
  "patientId" UUID NOT NULL REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "specialtyId" UUID NOT NULL REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "modality" "AppointmentModality" NOT NULL,
  "visitType" TEXT NOT NULL CHECK ("visitType" IN ('first','return')),
  "dateFrom" DATE NOT NULL,"dateTo" DATE NOT NULL CHECK ("dateTo">="dateFrom"),
  "timePreferences" JSONB NOT NULL CHECK (jsonb_typeof("timePreferences")='array' AND jsonb_array_length("timePreferences") BETWEEN 1 AND 14),
  "fingerprint" TEXT NOT NULL,
  "queuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'waiting' CHECK ("status" IN ('waiting','offered','fulfilled','cancelled')),
  "createdBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WaitlistEntry_specialtyId_modality_status_queuedAt_id_idx" ON "WaitlistEntry"("specialtyId","modality","status","queuedAt","id");
CREATE INDEX "WaitlistEntry_patientId_queuedAt_id_idx" ON "WaitlistEntry"("patientId","queuedAt","id");
CREATE UNIQUE INDEX waitlist_active_fingerprint ON "WaitlistEntry"("fingerprint") WHERE "status" IN ('waiting','offered');
CREATE TABLE "WaitlistOffer" (
  "id" UUID PRIMARY KEY,
  "entryId" UUID NOT NULL REFERENCES "WaitlistEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "releaseEventId" UUID NOT NULL REFERENCES "SlotReleaseEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "slotReservationId" UUID NOT NULL REFERENCES "SlotReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
  "offeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL CHECK ("expiresAt">"offeredAt"),
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','accepted','expired','cancelled')),
  "acceptedAt" TIMESTAMPTZ(3),
  "manualContactRequired" BOOLEAN NOT NULL DEFAULT false,
  CHECK (("status"='accepted')=("acceptedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "WaitlistOffer_slotReservationId_key" ON "WaitlistOffer"("slotReservationId");
CREATE UNIQUE INDEX "WaitlistOffer_entryId_releaseEventId_key" ON "WaitlistOffer"("entryId","releaseEventId");
CREATE UNIQUE INDEX waitlist_active_offer_entry ON "WaitlistOffer"("entryId") WHERE "status"='active';
CREATE UNIQUE INDEX waitlist_active_offer_event ON "WaitlistOffer"("releaseEventId") WHERE "status"='active';
CREATE INDEX "WaitlistOffer_status_expiresAt_idx" ON "WaitlistOffer"("status","expiresAt");
CREATE INDEX "WaitlistOffer_releaseEventId_status_idx" ON "WaitlistOffer"("releaseEventId","status");
CREATE TRIGGER waitlist_entry_no_delete BEFORE DELETE ON "WaitlistEntry" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE TRIGGER waitlist_offer_no_delete BEFORE DELETE ON "WaitlistOffer" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
CREATE FUNCTION preserve_waitlist_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='WaitlistEntry' THEN
    IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
      OR (OLD."status" IN ('fulfilled','cancelled') AND NEW."status"<>OLD."status") THEN
      RAISE EXCEPTION 'Waitlist entry history is immutable' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW)-'status'-'acceptedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'acceptedAt')
      OR (OLD."status"<>'active' AND (NEW."status"<>OLD."status" OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt")) THEN
      RAISE EXCEPTION 'Waitlist offer history is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER waitlist_entry_history BEFORE UPDATE ON "WaitlistEntry" FOR EACH ROW EXECUTE FUNCTION preserve_waitlist_history();
CREATE TRIGGER waitlist_offer_history BEFORE UPDATE ON "WaitlistOffer" FOR EACH ROW EXECUTE FUNCTION preserve_waitlist_history();
CREATE FUNCTION check_waitlist_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_id UUID; active_count INTEGER; entry_row "WaitlistEntry"%ROWTYPE; offer_row "WaitlistOffer"%ROWTYPE; reservation_row "SlotReservation"%ROWTYPE; appt "Appointment"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='WaitlistEntry' THEN entry_id:=NEW."id";
  ELSIF TG_TABLE_NAME='WaitlistOffer' THEN entry_id:=NEW."entryId";
  ELSE
    SELECT * INTO offer_row FROM "WaitlistOffer" WHERE "id"=NEW."offerId";
    IF FOUND AND offer_row."slotReservationId"<>NEW."id" THEN
      RAISE EXCEPTION 'Offer correlation must match its canonical reservation' USING ERRCODE='23514';
    END IF;
    SELECT "entryId" INTO entry_id FROM "WaitlistOffer" WHERE "slotReservationId"=NEW."id";
  END IF;
  IF entry_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO entry_row FROM "WaitlistEntry" WHERE "id"=entry_id;
  SELECT count(*) INTO active_count FROM "WaitlistOffer" WHERE "entryId"=entry_id AND "status"='active';
  IF (entry_row."status"='offered' AND active_count<>1) OR (entry_row."status"<>'offered' AND active_count<>0) THEN
    RAISE EXCEPTION 'Waitlist state must match its active offer' USING ERRCODE='23514';
  END IF;
  FOR offer_row IN SELECT * FROM "WaitlistOffer" WHERE "entryId"=entry_id LOOP
    SELECT * INTO reservation_row FROM "SlotReservation" WHERE "id"=offer_row."slotReservationId";
    IF NOT FOUND OR reservation_row."offerId" IS DISTINCT FROM offer_row."id"
      OR reservation_row."modality"<>entry_row."modality"
      OR (offer_row."status"='active' AND (reservation_row."state"<>'held' OR reservation_row."expiresAt" IS DISTINCT FROM offer_row."expiresAt"))
      OR (offer_row."status" IN ('expired','cancelled') AND reservation_row."state"<>'released') THEN
      RAISE EXCEPTION 'Offer and reservation must commit consistently' USING ERRCODE='23514';
    END IF;
    IF offer_row."status"='accepted' THEN
      SELECT * INTO appt FROM "Appointment" WHERE "id"=reservation_row."appointmentId";
      IF NOT FOUND OR entry_row."status"<>'fulfilled' OR reservation_row."state" NOT IN ('confirmed','released')
        OR appt."patientId"<>entry_row."patientId" OR appt."specialtyId"<>entry_row."specialtyId" OR appt."visitType"<>entry_row."visitType" THEN
        RAISE EXCEPTION 'Accepted offer must reference its appointment' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER waitlist_entry_consistency AFTER INSERT OR UPDATE ON "WaitlistEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_waitlist_consistency();
CREATE CONSTRAINT TRIGGER waitlist_offer_consistency AFTER INSERT OR UPDATE ON "WaitlistOffer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_waitlist_consistency();
CREATE CONSTRAINT TRIGGER waitlist_reservation_consistency AFTER INSERT OR UPDATE ON "SlotReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_waitlist_consistency();
