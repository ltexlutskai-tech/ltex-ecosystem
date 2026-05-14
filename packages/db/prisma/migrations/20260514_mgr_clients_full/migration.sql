-- Manager Clients FULL parity з 1С Catalog.Контрагенты (Session M1.3c)
-- Additive only: extends M1.3a schema без зачіпання існуючих полів.
-- Закриває pgap: 7 нових полів MgrClient + 3 нові таблиці (presentations, bank accounts, reminders)
-- + dictionary mgr_price_types + extensions на mgr_client_messengers + mgr_client_assortment.

-- ─── NEW dictionary: mgr_price_types ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_price_types" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_price_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_price_types_code_key"
  ON "mgr_price_types"("code");

-- ─── MgrClient: 7 нових полів ───────────────────────────────────────────────
ALTER TABLE "mgr_clients"
  ADD COLUMN IF NOT EXISTS "trade_point_name"  TEXT,
  ADD COLUMN IF NOT EXISTS "tov_debt"          DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "tov_overdue_debt"  DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "agent_user_id"     TEXT,
  ADD COLUMN IF NOT EXISTS "viber_contact"     TEXT,
  ADD COLUMN IF NOT EXISTS "session_remainder" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "price_type_id"     TEXT;

DO $$ BEGIN
  ALTER TABLE "mgr_clients"
    ADD CONSTRAINT "mgr_clients_agent_fkey"
    FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mgr_clients"
    ADD CONSTRAINT "mgr_clients_price_type_fkey"
    FOREIGN KEY ("price_type_id") REFERENCES "mgr_price_types"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── MgrClientAssortmentItem: notDirectInput ───────────────────────────────
ALTER TABLE "mgr_client_assortment"
  ADD COLUMN IF NOT EXISTS "not_direct_input" BOOLEAN NOT NULL DEFAULT false;

-- ─── MgrClientMessenger: browser_url ───────────────────────────────────────
ALTER TABLE "mgr_client_messengers"
  ADD COLUMN IF NOT EXISTS "browser_url" TEXT;

-- ─── NEW: mgr_client_presentations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_client_presentations" (
  "id"                  TEXT         NOT NULL,
  "client_id"           TEXT         NOT NULL,
  "product_code"        TEXT         NOT NULL,
  "product_name"        TEXT,
  "last_presented_at"   TIMESTAMP(3),
  "not_direct_input"    BOOLEAN      NOT NULL DEFAULT false,
  CONSTRAINT "mgr_client_presentations_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "mgr_client_presentations"
    ADD CONSTRAINT "mgr_client_presentations_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "mgr_client_presentations_client_idx"
  ON "mgr_client_presentations"("client_id");

-- ─── NEW: mgr_client_bank_accounts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_client_bank_accounts" (
  "id"             TEXT    NOT NULL,
  "client_id"      TEXT    NOT NULL,
  "account_number" TEXT    NOT NULL,
  "bank_name"      TEXT,
  "mfo"            TEXT,
  "comment"        TEXT,
  "is_hidden"      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mgr_client_bank_accounts_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "mgr_client_bank_accounts"
    ADD CONSTRAINT "mgr_client_bank_accounts_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "mgr_client_bank_accounts_client_idx"
  ON "mgr_client_bank_accounts"("client_id");

-- ─── NEW: mgr_reminders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_reminders" (
  "id"               TEXT         NOT NULL,
  "client_id"        TEXT         NOT NULL,
  "owner_user_id"    TEXT         NOT NULL,
  "body"             TEXT         NOT NULL,
  "remind_at"        TIMESTAMP(3) NOT NULL,
  "completed_at"     TIMESTAMP(3),
  "snoozed_until_at" TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_reminders_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "mgr_reminders"
    ADD CONSTRAINT "mgr_reminders_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mgr_reminders"
    ADD CONSTRAINT "mgr_reminders_owner_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "mgr_reminders_client_remind_idx"
  ON "mgr_reminders"("client_id", "remind_at");

CREATE INDEX IF NOT EXISTS "mgr_reminders_owner_status_idx"
  ON "mgr_reminders"("owner_user_id", "completed_at", "remind_at");
