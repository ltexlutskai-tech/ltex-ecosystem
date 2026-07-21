-- Габарити за замовчуванням на картці товару (авто-заповнення місць
-- відправлення завдання складу) + знімок цих полів у позиціях завдання.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "default_length_cm"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "default_width_cm"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "default_height_cm"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "default_seat_weight_kg" DOUBLE PRECISION;

ALTER TABLE "warehouse_task_items"
  ADD COLUMN IF NOT EXISTS "product_id"        TEXT,
  ADD COLUMN IF NOT EXISTS "packaging"         TEXT,
  ADD COLUMN IF NOT EXISTS "default_length_cm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "default_width_cm"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "default_height_cm" DOUBLE PRECISION;
