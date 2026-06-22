-- Якість товару (← 1С Catalog.Качество / _Reference59). Мінімальний довідник для
-- резолву hex(Качество) у регістрі залишків товарів. Additive + idempotent.
-- Дані переносяться через `--entity dictionaries-full` (idempotent upsert по
-- code1C = hex). Склади (Catalog.Склады / _Reference95) лягають у наявну таблицю
-- "warehouses" — окремої міграції не потребують.

CREATE TABLE IF NOT EXISTS "qualities" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "qualities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "qualities_code_1c_key" ON "qualities" ("code_1c");
