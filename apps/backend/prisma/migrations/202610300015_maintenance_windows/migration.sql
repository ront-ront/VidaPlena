CREATE TABLE "MaintenanceWindow" (
  "id" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "noticeReference" TEXT NOT NULL,
  "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceWindow_interval_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "MaintenanceWindow_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MaintenanceWindow_startsAt_endsAt_idx" ON "MaintenanceWindow"("startsAt", "endsAt");
