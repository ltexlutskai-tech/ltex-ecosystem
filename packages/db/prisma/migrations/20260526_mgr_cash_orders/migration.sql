-- Блок «Реалізація» — Етап 4 (касовий ордер MgrCashOrder)
-- КассовыйОрдер — оплата по реалізації у 3 валютах (грн/EUR/USD) + безнал,
-- авто-розрахунок здачі та авто-створення ордера-розходу при здачі > 0.
-- Усе additive + idempotent, магазину не заважає. Зразок — 20260525_mgr_sales.

-- ─── mgr_cash_orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_cash_orders" (
    "id"                  TEXT NOT NULL,
    "code_1c"             TEXT,
    "sale_id"             TEXT,
    "type"                TEXT NOT NULL,
    "amount_uah"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_eur"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_usd"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_uah_cashless" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "change_currency"     TEXT,
    "change_for_id"       TEXT,
    "bank_account"        TEXT,
    "cash_flow_article"   TEXT,
    "comment"             TEXT,
    "agent_user_id"       TEXT,
    "paid_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_cash_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_cash_orders_code_1c_key" ON "mgr_cash_orders" ("code_1c");
CREATE INDEX IF NOT EXISTS "mgr_cash_orders_sale_id_idx" ON "mgr_cash_orders" ("sale_id");

-- ─── Foreign keys (idempotent через guarded DO) ───────────────────────────────
DO $$
BEGIN
    ALTER TABLE "mgr_cash_orders"
        ADD CONSTRAINT "mgr_cash_orders_sale_id_fkey"
        FOREIGN KEY ("sale_id") REFERENCES "mgr_sales" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "mgr_cash_orders"
        ADD CONSTRAINT "mgr_cash_orders_change_for_id_fkey"
        FOREIGN KEY ("change_for_id") REFERENCES "mgr_cash_orders" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;
