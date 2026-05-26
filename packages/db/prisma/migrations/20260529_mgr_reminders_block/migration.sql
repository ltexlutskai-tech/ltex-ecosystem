-- Блок «Нагадування» — Етап 1 (розширення MgrReminder + нова mgr_reminder_items)
-- Standalone-екран нагадувань: clientId опційний, періодичність, прапорці,
-- плоскі скаляри lotId/productId (без FK, як у Маршрутному листі). Усе additive +
-- idempotent. Зразок — 20260528_mgr_route_sheets.

-- ─── enum-и (lowercase значення, snake_case @@map) ────────────────────────────
DO $$ BEGIN
    CREATE TYPE "mgr_reminder_period" AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly', 'event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "mgr_reminder_action" AS ENUM ('none', 'continue_bron', 'viber_video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "mgr_reminder_source" AS ENUM ('manual', 'auto_video', 'auto_bron');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_reminders: clientId опційний + нові колонки ──────────────────────────
ALTER TABLE "mgr_reminders" ALTER COLUMN "client_id" DROP NOT NULL;

ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "periodicity" "mgr_reminder_period" NOT NULL DEFAULT 'none';
ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "is_product_reminder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "order_video" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "action_type" "mgr_reminder_action" NOT NULL DEFAULT 'none';
ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "source" "mgr_reminder_source" NOT NULL DEFAULT 'manual';
ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "lot_id" TEXT;
ALTER TABLE "mgr_reminders" ADD COLUMN IF NOT EXISTS "product_id" TEXT;

-- ─── mgr_reminder_items (FK тільки на mgr_reminders, cascade; productId — скаляр) ─
CREATE TABLE IF NOT EXISTS "mgr_reminder_items" (
    "id"          TEXT NOT NULL,
    "reminder_id" TEXT NOT NULL,
    "product_id"  TEXT NOT NULL,
    "quantity"    INTEGER NOT NULL DEFAULT 1,
    "done"        BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mgr_reminder_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_reminder_items_reminder_id_idx" ON "mgr_reminder_items" ("reminder_id");

DO $$ BEGIN
    ALTER TABLE "mgr_reminder_items" ADD CONSTRAINT "mgr_reminder_items_reminder_id_fkey"
        FOREIGN KEY ("reminder_id") REFERENCES "mgr_reminders" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
