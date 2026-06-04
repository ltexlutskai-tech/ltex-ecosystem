-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20260606_purchase_prices_sectors (Хвиля 2 правок Поступлення)            ║
-- ║                                                                          ║
-- ║ 1. `purchase_prices` — регістр історії цін закупки (← правки 2026-06-05). ║
-- ║    При проведенні поступлення для кожного рядка пишеться запис.          ║
-- ║    Endpoint last-purchase-price повертає останню ціну за датою для пари  ║
-- ║    (товар, постачальник).                                                ║
-- ║                                                                          ║
-- ║ 2. `warehouse_sectors` — довідник секторів складу. Поки що не FK на      ║
-- ║    `receiving_items.sector` (вільний ввід), але autocomplete у формі.    ║
-- ║                                                                          ║
-- ║ Усі зміни — additive idempotent.                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Purchase prices history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "purchase_prices" (
  "id"                TEXT          NOT NULL,
  "product_id"        TEXT          NOT NULL,
  "supplier_id"       TEXT          NOT NULL,
  "price_eur"         DECIMAL(15,4) NOT NULL,
  "valid_from"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "source"            TEXT          NOT NULL DEFAULT 'receiving',
  "receiving_id"      TEXT,
  "receiving_item_id" TEXT,
  "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "purchase_prices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "purchase_prices_lookup_idx"
  ON "purchase_prices" ("product_id", "supplier_id", "valid_from" DESC);
CREATE INDEX IF NOT EXISTS "purchase_prices_supplier_idx"
  ON "purchase_prices" ("supplier_id");

DO $$ BEGIN
  ALTER TABLE "purchase_prices" ADD CONSTRAINT "purchase_prices_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_prices" ADD CONSTRAINT "purchase_prices_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_prices" ADD CONSTRAINT "purchase_prices_receiving_id_fkey"
    FOREIGN KEY ("receiving_id") REFERENCES "receivings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Warehouse sectors directory ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "warehouse_sectors" (
  "id"           TEXT          NOT NULL,
  "warehouse_id" TEXT,
  "name"         TEXT          NOT NULL,
  "is_active"    BOOLEAN       NOT NULL DEFAULT TRUE,
  "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "warehouse_sectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_sectors_unique"
  ON "warehouse_sectors" (COALESCE("warehouse_id", ''), "name");
CREATE INDEX IF NOT EXISTS "warehouse_sectors_active_idx"
  ON "warehouse_sectors" ("is_active");

DO $$ BEGIN
  ALTER TABLE "warehouse_sectors" ADD CONSTRAINT "warehouse_sectors_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
