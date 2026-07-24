-- Крок 4 інтеграції банкінгу (2026-07-24) — щоденне підбиття готівкової каси.
-- Знімки «обліковий залишок vs фактично пораховано» по ₴/€/$. Additive-only.

CREATE TABLE IF NOT EXISTS "cash_count_sessions" (
    "id" TEXT NOT NULL,
    "count_date" TIMESTAMP(3) NOT NULL,
    "expected_uah" DECIMAL(15,2) NOT NULL,
    "expected_eur" DECIMAL(15,2) NOT NULL,
    "expected_usd" DECIMAL(15,2) NOT NULL,
    "actual_uah" DECIMAL(15,2) NOT NULL,
    "actual_eur" DECIMAL(15,2) NOT NULL,
    "actual_usd" DECIMAL(15,2) NOT NULL,
    "comment" TEXT,
    "created_by_user_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_count_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cash_count_sessions_count_date_idx"
    ON "cash_count_sessions"("count_date");
