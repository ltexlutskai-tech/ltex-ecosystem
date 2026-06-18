-- 5.6 — одиниця виміру (довідник Unit) на рядках замовлення/реалізації.
-- Additive + idempotent; поки лише поле для майбутнього імпорту (UI не чіпаємо).
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_code_1c" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
ALTER TABLE "mgr_sale_items" ADD COLUMN IF NOT EXISTS "unit_code_1c" TEXT;
ALTER TABLE "mgr_sale_items" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
