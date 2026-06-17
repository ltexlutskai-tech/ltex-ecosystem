-- Фаза 2 (5.6) — регістри-обороти 1С AccumulationRegisters.
-- Усе additive + idempotent (IF NOT EXISTS / DO EXCEPTION), безпечно реран.

-- ─── Продажи (AccumRg Продажи / _AccumRg5604) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "sales_movements" (
  "id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorder_code_1c" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "product_code_1c" TEXT,
  "product_id" TEXT,
  "lot_code_1c" TEXT,
  "client_code_1c" TEXT,
  "client_id" TEXT,
  "agent_code_1c" TEXT,
  "order_code_1c" TEXT,
  "sale_code_1c" TEXT,
  "qty" DECIMAL(15,3) NOT NULL,
  "weight_kg" DECIMAL(15,3),
  "revenue_eur" DECIMAL(15,2) NOT NULL,
  "revenue_no_discount_eur" DECIMAL(15,2),
  "cost_eur" DECIMAL(15,2),
  "record_kind" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_movements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_movement_src" ON "sales_movements" ("recorder_code_1c", "line_no");
CREATE INDEX IF NOT EXISTS "sales_movements_client_code_1c_occurred_at_idx" ON "sales_movements" ("client_code_1c", "occurred_at");
CREATE INDEX IF NOT EXISTS "sales_movements_product_code_1c_idx" ON "sales_movements" ("product_code_1c");
CREATE INDEX IF NOT EXISTS "sales_movements_occurred_at_idx" ON "sales_movements" ("occurred_at");

-- ─── Рух коштів / ДДС (AccumRg ДвиженияДенежныхСредств / _AccumRg5309) ───────
CREATE TABLE IF NOT EXISTS "cash_flow_movements" (
  "id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorder_code_1c" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "account_code_1c" TEXT,
  "article_code_1c" TEXT,
  "direction" INTEGER NOT NULL,
  "client_code_1c" TEXT,
  "amount_uah" DECIMAL(15,2) NOT NULL,
  "amount_upr" DECIMAL(15,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_flow_movements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cash_flow_movement_src" ON "cash_flow_movements" ("recorder_code_1c", "line_no");
CREATE INDEX IF NOT EXISTS "cash_flow_movements_article_code_1c_occurred_at_idx" ON "cash_flow_movements" ("article_code_1c", "occurred_at");
CREATE INDEX IF NOT EXISTS "cash_flow_movements_occurred_at_idx" ON "cash_flow_movements" ("occurred_at");

-- ─── Залишки товарів (AccumRg ТоварыНаСкладах / _AccumRg5788 + вага 6608) ────
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorder_code_1c" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "warehouse_code_1c" TEXT,
  "product_code_1c" TEXT NOT NULL,
  "product_id" TEXT,
  "lot_code_1c" TEXT,
  "quality" TEXT,
  "qty" DECIMAL(15,3) NOT NULL,
  "weight_kg" DECIMAL(15,3),
  "record_kind" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "stock_movement_src" ON "stock_movements" ("recorder_code_1c", "line_no", "product_code_1c");
CREATE INDEX IF NOT EXISTS "stock_movements_product_code_1c_occurred_at_idx" ON "stock_movements" ("product_code_1c", "occurred_at");
CREATE INDEX IF NOT EXISTS "stock_movements_warehouse_code_1c_idx" ON "stock_movements" ("warehouse_code_1c");
CREATE INDEX IF NOT EXISTS "stock_movements_occurred_at_idx" ON "stock_movements" ("occurred_at");

-- ─── Залишки замовлень (AccumRg ЗаказыПокупателей / _AccumRg5374) ────────────
CREATE TABLE IF NOT EXISTS "order_remainder_movements" (
  "id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorder_code_1c" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "order_code_1c" TEXT NOT NULL,
  "order_id" TEXT,
  "product_code_1c" TEXT,
  "product_id" TEXT,
  "qty" DECIMAL(15,3) NOT NULL,
  "record_kind" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_remainder_movements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "order_remainder_movement_src" ON "order_remainder_movements" ("recorder_code_1c", "line_no", "order_code_1c");
CREATE INDEX IF NOT EXISTS "order_remainder_movements_order_code_1c_occurred_at_idx" ON "order_remainder_movements" ("order_code_1c", "occurred_at");
CREATE INDEX IF NOT EXISTS "order_remainder_movements_occurred_at_idx" ON "order_remainder_movements" ("occurred_at");
