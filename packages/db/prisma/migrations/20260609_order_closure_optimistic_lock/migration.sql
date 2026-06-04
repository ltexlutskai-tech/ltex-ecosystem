-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20260609_order_closure_optimistic_lock (Етапи 3-4 блоку Замовлення)      ║
-- ║                                                                          ║
-- ║ 1. Order — поля закриття + auto-нагадувань + optimistic lock:            ║
-- ║      closed_at, close_reason_id, closed_by_user_id, close_notes          ║
-- ║      last_reminder_at, reminders_sent_count, escalated_to_supervisor_at  ║
-- ║      version (Int, для conflict detection при concurrent PATCH)          ║
-- ║                                                                          ║
-- ║ 2. order_close_reasons — довідник причин закриття:                       ║
-- ║      id, code, label, isActive                                           ║
-- ║                                                                          ║
-- ║ Усі зміни — additive idempotent.                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Додаткові поля у Order ──────────────────────────────────────────────
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "closed_at"                    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "close_reason_id"              TEXT,
  ADD COLUMN IF NOT EXISTS "closed_by_user_id"            TEXT,
  ADD COLUMN IF NOT EXISTS "close_notes"                  TEXT,
  ADD COLUMN IF NOT EXISTS "last_reminder_at"             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reminders_sent_count"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "escalated_to_supervisor_at"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "version"                      INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "orders_closed_at_idx" ON "orders" ("closed_at");
CREATE INDEX IF NOT EXISTS "orders_last_reminder_at_idx" ON "orders" ("last_reminder_at");

-- ── 2. Order close reasons ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "order_close_reasons" (
  "id"         TEXT          NOT NULL,
  "code"       TEXT          NOT NULL,
  "label"      TEXT          NOT NULL,
  "is_active"  BOOLEAN       NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER       NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "order_close_reasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_close_reasons_code_key"
  ON "order_close_reasons" ("code");
CREATE INDEX IF NOT EXISTS "order_close_reasons_active_idx"
  ON "order_close_reasons" ("is_active", "sort_order");

-- FK на close_reason_id
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_close_reason_id_fkey"
    FOREIGN KEY ("close_reason_id") REFERENCES "order_close_reasons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_closed_by_user_id_fkey"
    FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Seed дефолтних причин закриття ──────────────────────────────────────
INSERT INTO "order_close_reasons" ("id", "code", "label", "sort_order") VALUES
  ('clr_client_refused', 'client_refused', 'Клієнт відмовив', 10),
  ('clr_no_stock',       'no_stock',       'Товару немає в наявності', 20),
  ('clr_sold_out',       'sold_out',       'Товар вже проданий', 30),
  ('clr_long_time',      'long_time',      'Замовлення «висить» надто довго', 40),
  ('clr_other',          'other',          'Інше', 90)
ON CONFLICT ("id") DO NOTHING;
