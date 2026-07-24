-- Крок 3 інтеграції банкінгу (2026-07-24) — воронка авто-рознесення платежів.
-- (1) Службові match-колонки на незмінному архіві виписки bank_transactions;
-- (2) payment_expectations — «очікування оплати» (менеджер скинув реквізити);
-- (3) client_payer_requisites — памʼять платників (самонавчання звʼязок).
-- Additive-only.

ALTER TABLE "bank_transactions"
    ADD COLUMN IF NOT EXISTS "match_status" TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "matched_customer_id" TEXT,
    ADD COLUMN IF NOT EXISTS "bank_payment_incoming_id" TEXT,
    ADD COLUMN IF NOT EXISTS "bank_payment_outgoing_id" TEXT,
    ADD COLUMN IF NOT EXISTS "match_note" TEXT,
    ADD COLUMN IF NOT EXISTS "matched_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "bank_transactions_match_status_idx"
    ON "bank_transactions"("match_status");

CREATE TABLE IF NOT EXISTS "payment_expectations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT,
    "sale_id" TEXT,
    "amount_uah" DECIMAL(15,2) NOT NULL,
    "bank_account_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "matched_transaction_id" TEXT,
    "matched_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_expectations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_expectations_status_expires_at_idx"
    ON "payment_expectations"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "payment_expectations_customer_id_idx"
    ON "payment_expectations"("customer_id");

CREATE TABLE IF NOT EXISTS "client_payer_requisites" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "counter_iban" TEXT,
    "counter_edrpou" TEXT,
    "counter_name" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_payer_requisites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "client_payer_requisites_counter_iban_idx"
    ON "client_payer_requisites"("counter_iban");
CREATE INDEX IF NOT EXISTS "client_payer_requisites_counter_edrpou_idx"
    ON "client_payer_requisites"("counter_edrpou");
CREATE INDEX IF NOT EXISTS "client_payer_requisites_customer_id_idx"
    ON "client_payer_requisites"("customer_id");
