-- Інвентаризація: спільна робота (server-authoritative) + журнал + сектори-ШК.
-- Additive, idempotent.

-- Штрихкод сектора (активний сектор при скануванні).
ALTER TABLE "warehouse_sectors"
  ADD COLUMN IF NOT EXISTS "barcode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_sectors_barcode_key"
  ON "warehouse_sectors" ("barcode");

-- Рядок інвентаризації: хто/коли підтвердив факт + FK-сектор + updatedAt.
ALTER TABLE "mgr_inventory_items"
  ADD COLUMN IF NOT EXISTS "sector_id"        TEXT,
  ADD COLUMN IF NOT EXISTS "found_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "found_by_name"    TEXT,
  ADD COLUMN IF NOT EXISTS "found_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "mgr_inventory_items_inventory_id_barcode_idx"
  ON "mgr_inventory_items" ("inventory_id", "barcode");

-- Журнал документа інвентаризації.
CREATE TABLE IF NOT EXISTS "mgr_inventory_logs" (
  "id"           TEXT NOT NULL,
  "inventory_id" TEXT NOT NULL,
  "user_id"      TEXT,
  "user_name"    TEXT,
  "action"       TEXT NOT NULL,
  "message"      TEXT NOT NULL,
  "barcode"      TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_inventory_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_inventory_logs_inventory_id_created_at_idx"
  ON "mgr_inventory_logs" ("inventory_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "mgr_inventory_logs"
    ADD CONSTRAINT "mgr_inventory_logs_inventory_id_fkey"
    FOREIGN KEY ("inventory_id") REFERENCES "mgr_inventories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
