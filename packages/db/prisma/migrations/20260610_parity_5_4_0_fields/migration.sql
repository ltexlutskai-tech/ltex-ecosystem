-- 5.4.0 — additive поля паритету з 1С (ДО дозбору даних).
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "legal_type" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "inn" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "edrpou" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "full_name" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "additional_description" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "working_hours" TEXT;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "parent_code_1c" TEXT;

ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "on_air" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "on_air_delivery" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "mgr_sales" ADD COLUMN IF NOT EXISTS "order_id" TEXT;
CREATE INDEX IF NOT EXISTS "mgr_sales_order_id_idx" ON "mgr_sales" ("order_id");
DO $$ BEGIN
  ALTER TABLE "mgr_sales" ADD CONSTRAINT "mgr_sales_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_price_eur" DOUBLE PRECISION;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "discount_percent" DOUBLE PRECISION;
