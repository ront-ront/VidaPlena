-- A pending email verification is delivered to the new address without changing the official one.
ALTER TABLE "Notification" ADD COLUMN "destinationEncrypted" TEXT;
