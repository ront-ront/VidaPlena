ALTER TABLE "AppointmentHistory" ADD COLUMN "origin" TEXT
  CHECK ("origin" IS NULL OR "origin" IN ('patient','reception','clinic'));
