-- Банківський фід (2026-07-24) — Крок 1 інтеграції банкінгу.
-- Рахунки з API банків (Monobank; далі PrivatBank) + незмінний архів
-- транзакцій (сира виписка, дедуп по банківському id). Additive-only.

CREATE TABLE IF NOT EXISTS "bank_feed_accounts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "iban" TEXT,
    "title" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'UAH',
    "balance" DECIMAL(15,2),
    "credit_limit" DECIMAL(15,2),
    "balance_at" TIMESTAMP(3),
    "mgr_bank_account_id" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "last_statement_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_feed_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_feed_accounts_provider_external_id_key"
    ON "bank_feed_accounts"("provider", "external_id");

DO $$ BEGIN
    ALTER TABLE "bank_feed_accounts"
        ADD CONSTRAINT "bank_feed_accounts_mgr_bank_account_id_fkey"
        FOREIGN KEY ("mgr_bank_account_id") REFERENCES "mgr_bank_accounts"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "bank_transactions" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "feed_account_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "counter_name" TEXT,
    "counter_iban" TEXT,
    "counter_edrpou" TEXT,
    "description" TEXT,
    "comment" TEXT,
    "balance_after" DECIMAL(15,2),
    "hold" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_provider_external_id_key"
    ON "bank_transactions"("provider", "external_id");

CREATE INDEX IF NOT EXISTS "bank_transactions_feed_account_id_occurred_at_idx"
    ON "bank_transactions"("feed_account_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "bank_transactions_occurred_at_idx"
    ON "bank_transactions"("occurred_at");

DO $$ BEGIN
    ALTER TABLE "bank_transactions"
        ADD CONSTRAINT "bank_transactions_feed_account_id_fkey"
        FOREIGN KEY ("feed_account_id") REFERENCES "bank_feed_accounts"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
