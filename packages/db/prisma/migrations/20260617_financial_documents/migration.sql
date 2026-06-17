-- Фаза 6 — Фінансові документи: банк/каса розширення.
-- Усе additive + idempotent (можна прогнати повторно без помилок).

-- ── 1. MgrCashOrder: спосіб оплати + банк-реквізити безготівки ──
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "bank_account_iban" TEXT;
ALTER TABLE "mgr_cash_orders" ADD COLUMN IF NOT EXISTS "payment_purpose" TEXT;

-- ── 2. Платіжне доручення вхідне (ПлатежноеПоручениеВходящее) ──
CREATE TABLE IF NOT EXISTS "bank_payments_incoming" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "number_1c" TEXT,
  "doc_number" SERIAL NOT NULL,
  "customer_id" TEXT,
  "bank_account_id" TEXT,
  "cash_flow_article_id" TEXT,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'UAH',
  "amount_eur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rate_eur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "iban" TEXT,
  "purpose" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "comment" TEXT,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_payments_incoming_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_payments_incoming_code_1c_key" ON "bank_payments_incoming" ("code_1c");
CREATE INDEX IF NOT EXISTS "bank_payments_incoming_customer_id_idx" ON "bank_payments_incoming" ("customer_id");
CREATE INDEX IF NOT EXISTS "bank_payments_incoming_archived_idx" ON "bank_payments_incoming" ("archived");
CREATE INDEX IF NOT EXISTS "bank_payments_incoming_paid_at_idx" ON "bank_payments_incoming" ("paid_at");

DO $$ BEGIN
  ALTER TABLE "bank_payments_incoming" ADD CONSTRAINT "bank_payments_incoming_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bank_payments_incoming" ADD CONSTRAINT "bank_payments_incoming_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "mgr_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bank_payments_incoming" ADD CONSTRAINT "bank_payments_incoming_cash_flow_article_id_fkey"
    FOREIGN KEY ("cash_flow_article_id") REFERENCES "mgr_cash_flow_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 3. Платіжне доручення вихідне (ПлатежноеПоручениеИсходящее) ──
CREATE TABLE IF NOT EXISTS "bank_payments_outgoing" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "number_1c" TEXT,
  "doc_number" SERIAL NOT NULL,
  "customer_id" TEXT,
  "bank_account_id" TEXT,
  "cash_flow_article_id" TEXT,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'UAH',
  "amount_eur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rate_eur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "iban" TEXT,
  "purpose" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "comment" TEXT,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_payments_outgoing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_payments_outgoing_code_1c_key" ON "bank_payments_outgoing" ("code_1c");
CREATE INDEX IF NOT EXISTS "bank_payments_outgoing_customer_id_idx" ON "bank_payments_outgoing" ("customer_id");
CREATE INDEX IF NOT EXISTS "bank_payments_outgoing_archived_idx" ON "bank_payments_outgoing" ("archived");
CREATE INDEX IF NOT EXISTS "bank_payments_outgoing_paid_at_idx" ON "bank_payments_outgoing" ("paid_at");

DO $$ BEGIN
  ALTER TABLE "bank_payments_outgoing" ADD CONSTRAINT "bank_payments_outgoing_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bank_payments_outgoing" ADD CONSTRAINT "bank_payments_outgoing_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "mgr_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bank_payments_outgoing" ADD CONSTRAINT "bank_payments_outgoing_cash_flow_article_id_fkey"
    FOREIGN KEY ("cash_flow_article_id") REFERENCES "mgr_cash_flow_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 4. Переміщення готівки / інкасація (ВнутреннееПеремещениеНаличных…) ──
CREATE TABLE IF NOT EXISTS "cash_transfers" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "number_1c" TEXT,
  "doc_number" SERIAL NOT NULL,
  "from_account_id" TEXT,
  "to_account_id" TEXT,
  "cash_flow_article_id" TEXT,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'UAH',
  "amount_eur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rate_eur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "comment" TEXT,
  "transferred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cash_transfers_code_1c_key" ON "cash_transfers" ("code_1c");
CREATE INDEX IF NOT EXISTS "cash_transfers_archived_idx" ON "cash_transfers" ("archived");
CREATE INDEX IF NOT EXISTS "cash_transfers_transferred_at_idx" ON "cash_transfers" ("transferred_at");

DO $$ BEGIN
  ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_account_id_fkey"
    FOREIGN KEY ("from_account_id") REFERENCES "mgr_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_account_id_fkey"
    FOREIGN KEY ("to_account_id") REFERENCES "mgr_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_cash_flow_article_id_fkey"
    FOREIGN KEY ("cash_flow_article_id") REFERENCES "mgr_cash_flow_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
