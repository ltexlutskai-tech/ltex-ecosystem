ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "number_1c" TEXT;
CREATE INDEX IF NOT EXISTS "orders_number_1c_idx" ON "orders" ("number_1c");
