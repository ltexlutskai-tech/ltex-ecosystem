-- Блок «Реалізація» — Етап 1 (нові моделі Sale + SaleItem)
-- Реалізація (Document.РеализацияТоваровУслуг) — окремий документ, що фіксує
-- факт продажу/відвантаження клієнту. Усе additive + idempotent, магазину не
-- заважає. Зразок — Order/OrderItem (20260524_order_manager_fields).

-- ─── enum SyncEntityType += 'realization' ─────────────────────────────────────
-- ADD VALUE не можна виконати всередині транзакції разом з його використанням,
-- але окремий ADD VALUE IF NOT EXISTS — idempotent і безпечний.
DO $$
BEGIN
    ALTER TYPE "mgr_sync_entity_type" ADD VALUE IF NOT EXISTS 'realization';
EXCEPTION
    WHEN undefined_object THEN
        -- Тип ще не існує (чиста БД до 20260515_sync_jobs) — пропускаємо;
        -- enum створиться з усіма значеннями міграцією sync_jobs.
        NULL;
END
$$;

-- ─── mgr_sales ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_sales" (
    "id"                       TEXT NOT NULL,
    "code_1c"                  TEXT,
    "doc_number"               SERIAL NOT NULL,
    "customer_id"              TEXT NOT NULL,
    "status"                   TEXT NOT NULL DEFAULT 'draft',
    "total_eur"                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_uah"                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchange_rate_eur"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchange_rate_usd"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price_type_id"            TEXT,
    "delivery_method"          TEXT,
    "nova_poshta_branch"       TEXT,
    "cash_on_delivery"         BOOLEAN NOT NULL DEFAULT false,
    "cod_amount_uah"           DOUBLE PRECISION,
    "assigned_agent_user_id"   TEXT,
    "on_trade_agent"           BOOLEAN NOT NULL DEFAULT true,
    "export_to_1c"             BOOLEAN NOT NULL DEFAULT true,
    "express_waybill"          TEXT,
    "notes"                    TEXT,
    "order_id"                 TEXT,
    "route_id"                 TEXT,
    "archived"                 BOOLEAN NOT NULL DEFAULT false,
    "is_actual"                BOOLEAN NOT NULL DEFAULT true,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_sales_code_1c_key" ON "mgr_sales" ("code_1c");
CREATE INDEX IF NOT EXISTS "mgr_sales_customer_id_idx" ON "mgr_sales" ("customer_id");
CREATE INDEX IF NOT EXISTS "mgr_sales_status_idx" ON "mgr_sales" ("status");

-- ─── mgr_sale_items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_sale_items" (
    "id"           TEXT NOT NULL,
    "sale_id"      TEXT NOT NULL,
    "product_id"   TEXT NOT NULL,
    "lot_id"       TEXT,
    "barcode"      TEXT,
    "price_per_kg" DOUBLE PRECISION NOT NULL,
    "weight"       DOUBLE PRECISION NOT NULL,
    "quantity"     INTEGER NOT NULL DEFAULT 1,
    "price_eur"    DOUBLE PRECISION NOT NULL,
    CONSTRAINT "mgr_sale_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_sale_items_sale_id_idx" ON "mgr_sale_items" ("sale_id");

-- ─── Foreign keys (idempotent через guarded DO) ───────────────────────────────
DO $$
BEGIN
    ALTER TABLE "mgr_sales"
        ADD CONSTRAINT "mgr_sales_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_sale_items"
        ADD CONSTRAINT "mgr_sale_items_sale_id_fkey"
        FOREIGN KEY ("sale_id") REFERENCES "mgr_sales" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_sale_items"
        ADD CONSTRAINT "mgr_sale_items_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "products" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_sale_items"
        ADD CONSTRAINT "mgr_sale_items_lot_id_fkey"
        FOREIGN KEY ("lot_id") REFERENCES "lots" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;
