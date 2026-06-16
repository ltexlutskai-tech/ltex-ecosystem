ALTER TABLE "mgr_sales" ADD COLUMN IF NOT EXISTS "number_1c" TEXT;
CREATE INDEX IF NOT EXISTS "mgr_sales_number_1c_idx" ON "mgr_sales" ("number_1c");
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "number_1c" TEXT;
CREATE INDEX IF NOT EXISTS "mgr_cash_orders_number_1c_idx" ON "mgr_cash_orders" ("number_1c");
ALTER TABLE "mgr_route_sheets" ADD COLUMN IF NOT EXISTS "number_1c" TEXT;
CREATE INDEX IF NOT EXISTS "mgr_route_sheets_number_1c_idx" ON "mgr_route_sheets" ("number_1c");
