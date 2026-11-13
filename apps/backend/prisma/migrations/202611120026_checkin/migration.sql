CREATE TABLE "CheckIn" (
  "id" UUID NOT NULL PRIMARY KEY,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE RESTRICT,
  "appointmentVersion" INTEGER NOT NULL CHECK ("appointmentVersion" > 0),
  "arrivedAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL CHECK ("arrivedAt" <= "recordedAt"),
  "recordedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "lateFlag" BOOLEAN NOT NULL,
  "toleranceMinutes" INTEGER NOT NULL CHECK ("toleranceMinutes" >= 0),
  "clinicTimeZone" TEXT NOT NULL
);
CREATE UNIQUE INDEX "CheckIn_appointmentId_appointmentVersion_key" ON "CheckIn"("appointmentId","appointmentVersion");
CREATE TRIGGER checkin_immutable BEFORE UPDATE OR DELETE ON "CheckIn" FOR EACH ROW EXECUTE FUNCTION preserve_schedule_snapshot();
