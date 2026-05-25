-- Блок «Маршрутний лист» — Етап 1 (нові моделі RouteSheet + 7 дочірніх)
-- Документ-агрегатор дня виїзду (1С Document.МаршрутныйЛист). Усе additive +
-- idempotent, магазину не заважає. Cross-model id-поля у дочірніх — плоскі
-- скаляри без FK (резолв batch-lookup); FK+cascade лише child→mgr_route_sheets.
-- Зразок — 20260527_mgr_payments / 20260525_mgr_sales.

-- ─── enum SyncEntityType += 'route_sheet' ─────────────────────────────────────
DO $$
BEGIN
    ALTER TYPE "mgr_sync_entity_type" ADD VALUE IF NOT EXISTS 'route_sheet';
EXCEPTION
    WHEN undefined_object THEN
        NULL;
END
$$;

-- ─── Зворотні посилання на МЛ (1С Заказ/Реализация/КассовыйОрдер.МаршрутныйЛист) ─
ALTER TABLE "orders"          ADD COLUMN IF NOT EXISTS "route_sheet_id" TEXT;
ALTER TABLE "mgr_sales"       ADD COLUMN IF NOT EXISTS "route_sheet_id" TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "route_sheet_id" TEXT;
CREATE INDEX IF NOT EXISTS "orders_route_sheet_id_idx"          ON "orders" ("route_sheet_id");
CREATE INDEX IF NOT EXISTS "mgr_sales_route_sheet_id_idx"       ON "mgr_sales" ("route_sheet_id");
CREATE INDEX IF NOT EXISTS "mgr_cash_orders_route_sheet_id_idx" ON "mgr_cash_orders" ("route_sheet_id");

-- ─── mgr_route_sheets (шапка) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_route_sheets" (
    "id"                 TEXT NOT NULL,
    "code_1c"            TEXT,
    "doc_number"         SERIAL NOT NULL,
    "date"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrival_date"       TIMESTAMP(3),
    "status"             TEXT NOT NULL DEFAULT 'draft',
    "route_id"           TEXT,
    "expeditor_user_id"  TEXT,
    "created_by_user_id" TEXT,
    "total_uah"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_eur"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comment"            TEXT,
    "mileage_start_km"   DOUBLE PRECISION,
    "mileage_end_km"     DOUBLE PRECISION,
    "gps_lat"            DOUBLE PRECISION,
    "gps_lng"            DOUBLE PRECISION,
    "archived"           BOOLEAN NOT NULL DEFAULT false,
    "export_to_1c"       BOOLEAN NOT NULL DEFAULT true,
    "posted"             BOOLEAN NOT NULL DEFAULT false,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_route_sheets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_route_sheets_code_1c_key"          ON "mgr_route_sheets" ("code_1c");
CREATE INDEX IF NOT EXISTS        "mgr_route_sheets_status_idx"           ON "mgr_route_sheets" ("status");
CREATE INDEX IF NOT EXISTS        "mgr_route_sheets_route_id_idx"         ON "mgr_route_sheets" ("route_id");
CREATE INDEX IF NOT EXISTS        "mgr_route_sheets_expeditor_user_id_idx" ON "mgr_route_sheets" ("expeditor_user_id");
CREATE INDEX IF NOT EXISTS        "mgr_route_sheets_archived_idx"         ON "mgr_route_sheets" ("archived");

-- ─── Дочірні таблиці (FK тільки на mgr_route_sheets, cascade) ──────────────────
CREATE TABLE IF NOT EXISTS "mgr_route_sheet_orders" (
    "id"             TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "order_id"       TEXT NOT NULL,
    "customer_id"    TEXT,
    "city"           TEXT,
    CONSTRAINT "mgr_route_sheet_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_orders_route_sheet_id_idx" ON "mgr_route_sheet_orders" ("route_sheet_id");
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_orders_order_id_idx"       ON "mgr_route_sheet_orders" ("order_id");

CREATE TABLE IF NOT EXISTS "mgr_route_sheet_items" (
    "id"              TEXT NOT NULL,
    "route_sheet_id"  TEXT NOT NULL,
    "order_id"        TEXT,
    "customer_id"     TEXT,
    "product_id"      TEXT NOT NULL,
    "lot_id"          TEXT,
    "unit"            TEXT,
    "quantity"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sum"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity_loaded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "mgr_route_sheet_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_items_route_sheet_id_idx" ON "mgr_route_sheet_items" ("route_sheet_id");

CREATE TABLE IF NOT EXISTS "mgr_route_sheet_loading" (
    "id"             TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "order_id"       TEXT,
    "customer_id"    TEXT,
    "product_id"     TEXT NOT NULL,
    "lot_id"         TEXT NOT NULL,
    "barcode"        TEXT NOT NULL,
    "unit"           TEXT,
    "quantity"       DOUBLE PRECISION NOT NULL DEFAULT 1,
    "weight"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sum"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price_per_kg"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loaded"         BOOLEAN NOT NULL DEFAULT true,
    "is_return"      BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "mgr_route_sheet_loading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_loading_route_sheet_id_idx" ON "mgr_route_sheet_loading" ("route_sheet_id");

CREATE TABLE IF NOT EXISTS "mgr_route_sheet_sales" (
    "id"             TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "order_id"       TEXT,
    "customer_id"    TEXT,
    "sale_id"        TEXT NOT NULL,
    "sum"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "mgr_route_sheet_sales_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_sales_route_sheet_id_idx" ON "mgr_route_sheet_sales" ("route_sheet_id");

CREATE TABLE IF NOT EXISTS "mgr_route_sheet_sale_items" (
    "id"             TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "sale_id"        TEXT NOT NULL,
    "order_id"       TEXT,
    "customer_id"    TEXT,
    "product_id"     TEXT NOT NULL,
    "lot_id"         TEXT,
    "unit"           TEXT,
    "quantity"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sum"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price_per_kg"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "mgr_route_sheet_sale_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_sale_items_route_sheet_id_idx" ON "mgr_route_sheet_sale_items" ("route_sheet_id");

CREATE TABLE IF NOT EXISTS "mgr_route_sheet_payments" (
    "id"             TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "order_id"       TEXT,
    "sale_id"        TEXT,
    "customer_id"    TEXT,
    "cash_order_id"  TEXT NOT NULL,
    "amount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "mgr_route_sheet_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_payments_route_sheet_id_idx" ON "mgr_route_sheet_payments" ("route_sheet_id");

CREATE TABLE IF NOT EXISTS "mgr_route_sheet_tasks" (
    "id"             TEXT NOT NULL,
    "route_sheet_id" TEXT NOT NULL,
    "customer_id"    TEXT,
    "comment"        TEXT NOT NULL,
    CONSTRAINT "mgr_route_sheet_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_tasks_route_sheet_id_idx" ON "mgr_route_sheet_tasks" ("route_sheet_id");

-- ─── Foreign keys ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "mgr_route_sheets" ADD CONSTRAINT "mgr_route_sheets_route_id_fkey"
        FOREIGN KEY ("route_id") REFERENCES "mgr_routes" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheets" ADD CONSTRAINT "mgr_route_sheets_expeditor_user_id_fkey"
        FOREIGN KEY ("expeditor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheets" ADD CONSTRAINT "mgr_route_sheets_created_by_user_id_fkey"
        FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_orders" ADD CONSTRAINT "mgr_route_sheet_orders_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_items" ADD CONSTRAINT "mgr_route_sheet_items_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_loading" ADD CONSTRAINT "mgr_route_sheet_loading_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_sales" ADD CONSTRAINT "mgr_route_sheet_sales_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_sale_items" ADD CONSTRAINT "mgr_route_sheet_sale_items_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_payments" ADD CONSTRAINT "mgr_route_sheet_payments_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_route_sheet_tasks" ADD CONSTRAINT "mgr_route_sheet_tasks_route_sheet_id_fkey"
        FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
