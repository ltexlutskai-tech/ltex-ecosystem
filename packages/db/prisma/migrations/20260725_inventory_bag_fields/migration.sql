-- Інвентаризація по мішках (2026-07-12): знімок мішка у рядку інвентаризації.
-- Additive, idempotent. Плоскі скаляри (як RepackingItem), без FK на lots.

ALTER TABLE "mgr_inventory_items"
  ADD COLUMN IF NOT EXISTS "lot_id"       TEXT,
  ADD COLUMN IF NOT EXISTS "product_name" TEXT,
  ADD COLUMN IF NOT EXISTS "article_code" TEXT,
  ADD COLUMN IF NOT EXISTS "weight"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sector"       TEXT,
  ADD COLUMN IF NOT EXISTS "unit_name"    TEXT,
  ADD COLUMN IF NOT EXISTS "quality"      TEXT;
