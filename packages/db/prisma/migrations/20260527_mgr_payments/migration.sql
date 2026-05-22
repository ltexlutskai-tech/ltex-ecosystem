-- Блок «Оплати / Каса» — Етап 1 (розширення mgr_cash_orders + 2 довідники)
-- Повний касовий ордер за 1С (DataProcessor.Оплата + Document.КассовыйОрдер):
-- курси-знімок, зведена сума EUR, коректировка боргу, мультивалютні UUID-ключі
-- обміну, прив'язка до Контрагента + довідники банк. рахунків і статей руху.
-- Усе additive + idempotent, магазину/Реалізації не заважає.
-- Зразок — 20260525_mgr_sales / 20260526_mgr_cash_orders.

-- ─── enum SyncEntityType += 'cash_order' ──────────────────────────────────────
DO $$
BEGIN
    ALTER TYPE "mgr_sync_entity_type" ADD VALUE IF NOT EXISTS 'cash_order';
EXCEPTION
    WHEN undefined_object THEN
        -- Тип ще не існує (чиста БД до 20260515_sync_jobs) — пропускаємо.
        NULL;
END
$$;

-- ─── Нові поля mgr_cash_orders ────────────────────────────────────────────────
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "customer_id"          TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "bank_account_id"      TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "cash_flow_article_id" TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "rate_eur"             DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "rate_usd"             DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "document_sum_eur"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "debt_correction"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "correction_uid"       TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "uid_uah"              TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "uid_eur"              TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "uid_usd"              TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "archived"             BOOLEAN NOT NULL DEFAULT false;

-- doc_number: автоінкремент (SERIAL → послідовність mgr_cash_orders_doc_number_seq,
-- конвенція Prisma @default(autoincrement())). DEFAULT присвоює унікальні значення
-- наявним рядкам при додаванні стовпця. IF NOT EXISTS робить крок idempotent.
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "doc_number" SERIAL;

-- ─── Довідник банк. рахунків (mgr_bank_accounts) ──────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_bank_accounts" (
    "id"            TEXT NOT NULL,
    "code_1c"       TEXT,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "hidden_in_app" BOOLEAN NOT NULL DEFAULT false,
    "archived"      BOOLEAN NOT NULL DEFAULT false,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_bank_accounts_code_1c_key" ON "mgr_bank_accounts" ("code_1c");

-- ─── Довідник статей руху коштів (mgr_cash_flow_articles) ─────────────────────
CREATE TABLE IF NOT EXISTS "mgr_cash_flow_articles" (
    "id"         TEXT NOT NULL,
    "code_1c"    TEXT,
    "code"       TEXT,
    "name"       TEXT NOT NULL,
    "parent_id"  TEXT,
    "archived"   BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_cash_flow_articles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_cash_flow_articles_code_1c_key" ON "mgr_cash_flow_articles" ("code_1c");

-- ─── Індекси mgr_cash_orders ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "mgr_cash_orders_customer_id_idx" ON "mgr_cash_orders" ("customer_id");
CREATE INDEX IF NOT EXISTS "mgr_cash_orders_archived_idx"    ON "mgr_cash_orders" ("archived");

-- ─── Foreign keys (idempotent через guarded DO) ───────────────────────────────
DO $$
BEGIN
    ALTER TABLE "mgr_cash_orders"
        ADD CONSTRAINT "mgr_cash_orders_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_cash_orders"
        ADD CONSTRAINT "mgr_cash_orders_bank_account_id_fkey"
        FOREIGN KEY ("bank_account_id") REFERENCES "mgr_bank_accounts" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_cash_orders"
        ADD CONSTRAINT "mgr_cash_orders_cash_flow_article_id_fkey"
        FOREIGN KEY ("cash_flow_article_id") REFERENCES "mgr_cash_flow_articles" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_cash_flow_articles"
        ADD CONSTRAINT "mgr_cash_flow_articles_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "mgr_cash_flow_articles" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;
