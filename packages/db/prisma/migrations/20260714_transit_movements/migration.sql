-- Блок А: регістр «товар у дорозі» (1С ТоварыВДороге). Additive.
CREATE TABLE IF NOT EXISTS "transit_movements" (
  "id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorder_code_1c" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "product_code_1c" TEXT NOT NULL,
  "product_id" TEXT,
  "lot_code_1c" TEXT,
  "lot_id" TEXT,
  "client_code_1c" TEXT,
  "qty" DECIMAL(15,3) NOT NULL,
  "weight_kg" DECIMAL(15,3),
  "record_kind" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transit_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "transit_movements_recorder_code_1c_line_no_product_code_1c_key"
  ON "transit_movements" ("recorder_code_1c", "line_no", "product_code_1c");
CREATE INDEX IF NOT EXISTS "transit_movements_product_code_1c_occurred_at_idx"
  ON "transit_movements" ("product_code_1c", "occurred_at");
CREATE INDEX IF NOT EXISTS "transit_movements_lot_id_idx"
  ON "transit_movements" ("lot_id");
CREATE INDEX IF NOT EXISTS "transit_movements_occurred_at_idx"
  ON "transit_movements" ("occurred_at");
