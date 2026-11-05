CREATE TABLE "Room" (
  "id" UUID PRIMARY KEY, "name" TEXT NOT NULL CHECK (length(btrim("name")) BETWEEN 1 AND 255),
  "active" BOOLEAN NOT NULL DEFAULT true, "capacity" INTEGER NOT NULL DEFAULT 1 CHECK ("capacity"=1),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Room_active_id_idx" ON "Room"("active","id");
CREATE UNIQUE INDEX "Room_active_name_key" ON "Room" (lower(btrim("name"))) WHERE "active";
CREATE TRIGGER room_no_delete BEFORE DELETE ON "Room" FOR EACH ROW EXECUTE FUNCTION preserve_catalog_entry();
