-- Перепаковка повного циклу (як у 1С Документ.Перепаковка). Additive + idempotent.
-- Нові nullable-поля рядків перепаковки, стабільний ключ сектора,
-- key-value налаштування (допуск ваги). Реімпорт НЕ потрібен — історичні
-- перепаковки лишаються як рухи, нові поля порожні.

-- 1. Нові поля рядків перепаковки (mgr_repacking_items).
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "source_lot_id" TEXT;
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "source_prev_status" TEXT;
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "created_lot_id" TEXT;
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "sale_price_eur" DECIMAL(12,2);
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "quality_id" TEXT;
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "sector" TEXT;
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "sector_id" TEXT;
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "cost_per_kg_eur" DECIMAL(12,2);

-- 2. Стабільний ключ сектора складу (find-or-create за назвою).
ALTER TABLE "warehouse_sectors" ADD COLUMN IF NOT EXISTS "code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_sectors_code_key" ON "warehouse_sectors" ("code");

-- 3. Key-value налаштування менеджерки (допуск ваги при перепаковці тощо).
CREATE TABLE IF NOT EXISTS "mgr_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_settings_pkey" PRIMARY KEY ("key")
);
