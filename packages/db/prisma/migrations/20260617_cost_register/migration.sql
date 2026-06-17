-- Рухи собівартості (← 1С AccumRg ПродажиСебестоимость `_AccumRg5634`).
-- Additive, idempotent. Наповнюється `import-1c-historical.ts --entity cost-reg`.

CREATE TABLE IF NOT EXISTS "cost_movements" (
  "id" TEXT NOT NULL,
  "recorder_code_1c" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "product_code_1c" TEXT,
  "product_id" TEXT,
  "qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "cost_eur" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cost_movement_recorder_line"
  ON "cost_movements" ("recorder_code_1c", "line_no");
CREATE INDEX IF NOT EXISTS "cost_movements_recorder_code_1c_idx"
  ON "cost_movements" ("recorder_code_1c");
CREATE INDEX IF NOT EXISTS "cost_movements_product_code_1c_idx"
  ON "cost_movements" ("product_code_1c");
CREATE INDEX IF NOT EXISTS "cost_movements_occurred_at_idx"
  ON "cost_movements" ("occurred_at");
