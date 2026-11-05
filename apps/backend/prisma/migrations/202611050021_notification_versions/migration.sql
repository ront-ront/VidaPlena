-- Identity notifications already use millisecond timestamps as aggregate versions.
-- Preserve those versions without narrowing them to PostgreSQL INTEGER.
ALTER TABLE "Notification" ALTER COLUMN "aggregateVersion" TYPE BIGINT;
