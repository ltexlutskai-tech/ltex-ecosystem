-- Nova Poshta + Checkbox інтеграція, Фаза 0 (2026-07-20).
-- Additive, idempotent: нова «назва для чека» на товарі + структуровані поля
-- Нової Пошти (відділення-отримувач + ТТН) на реалізації.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "receipt_name" TEXT;

ALTER TABLE "mgr_sales"
  ADD COLUMN IF NOT EXISTS "np_city_ref"            TEXT,
  ADD COLUMN IF NOT EXISTS "np_city_name"           TEXT,
  ADD COLUMN IF NOT EXISTS "np_warehouse_ref"       TEXT,
  ADD COLUMN IF NOT EXISTS "np_warehouse_name"      TEXT,
  ADD COLUMN IF NOT EXISTS "np_delivery_type"       TEXT,
  ADD COLUMN IF NOT EXISTS "ttn_ref"                TEXT,
  ADD COLUMN IF NOT EXISTS "ttn_created_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ttn_error"              TEXT,
  ADD COLUMN IF NOT EXISTS "declared_value_uah"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "declared_value_enabled" BOOLEAN NOT NULL DEFAULT true;
