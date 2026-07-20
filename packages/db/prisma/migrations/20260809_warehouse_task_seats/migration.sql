-- Nova Poshta + Checkbox, Фаза 2: місця відправлення (габарити для ТТН).
-- Склад визначає фактичні місця (мініпалета/палета/коробка) з вагою й габаритами.

CREATE TABLE IF NOT EXISTS "warehouse_task_seats" (
  "id"        TEXT NOT NULL,
  "task_id"   TEXT NOT NULL,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "weight"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "length_cm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "width_cm"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "height_cm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"      TEXT,
  CONSTRAINT "warehouse_task_seats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "warehouse_task_seats_task_id_idx"
  ON "warehouse_task_seats" ("task_id");

DO $$ BEGIN
  ALTER TABLE "warehouse_task_seats"
    ADD CONSTRAINT "warehouse_task_seats_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "warehouse_tasks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Друк етикетки НП з нашої системи: «Готово» доступне лише після друку.
ALTER TABLE "warehouse_tasks"
  ADD COLUMN IF NOT EXISTS "label_printed_at" TIMESTAMP(3);
