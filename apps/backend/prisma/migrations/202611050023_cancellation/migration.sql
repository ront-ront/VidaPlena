CREATE TABLE "SlotReleaseEvent" (
  "id" UUID PRIMARY KEY,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "changeVersion" INTEGER NOT NULL CHECK ("changeVersion">0),
  "professionalId" UUID NOT NULL REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "specialtyId" UUID NOT NULL REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "roomId" UUID REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "modality" "AppointmentModality" NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,"endsAt" TIMESTAMPTZ(3) NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('cancelled','rescheduled')),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),"attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts">=0),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("startsAt"<"endsAt"),
  CHECK (("modality"='onsite' AND "roomId" IS NOT NULL) OR ("modality"='remote' AND "roomId" IS NULL))
);
CREATE UNIQUE INDEX "SlotReleaseEvent_appointmentId_changeVersion_key" ON "SlotReleaseEvent"("appointmentId","changeVersion");
CREATE INDEX "SlotReleaseEvent_processedAt_nextAttemptAt_createdAt_idx" ON "SlotReleaseEvent"("processedAt","nextAttemptAt","createdAt");
