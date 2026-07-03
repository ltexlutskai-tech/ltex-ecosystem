-- Журнал злиттів дублікатів номенклатури (Сесія 7.1).
-- 1С-номенклатура містить дублікати одного артикула (старий запис з історією +
-- новий актуальний, різні code1C). Скрипт `merge-duplicate-products.ts` зливає
-- історію на актуальний (survivor) і видаляє старий Product. Ця таблиця —
-- журнал злиттів + мапа для імпортера: майбутні реімпорти по старому code1C
-- НЕ відтворюють видалений товар, а маршрутизуються на survivor.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS "product_merges" (
  "id" TEXT NOT NULL,
  "old_code_1c" TEXT NOT NULL,
  "target_product_id" TEXT NOT NULL,
  "old_name" TEXT NOT NULL,
  "merged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_merges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_merges_old_code_1c_key"
  ON "product_merges" ("old_code_1c");

CREATE INDEX IF NOT EXISTS "product_merges_target_product_id_idx"
  ON "product_merges" ("target_product_id");

DO $$ BEGIN
  ALTER TABLE "product_merges" ADD CONSTRAINT "product_merges_target_product_id_fkey"
    FOREIGN KEY ("target_product_id") REFERENCES "products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
