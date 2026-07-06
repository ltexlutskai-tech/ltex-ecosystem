-- Session 7.2 Block 1: site orders → system
-- Additive & idempotent.

-- 1. Order.source — розрізняє джерело замовлення ("site" | "manager" | "1c").
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manager';

-- 2. MgrReminder.order_id — лінк авто-нагадування «обробити сайтове замовлення»
--    на конкретне замовлення (щоб deep-link + авто-завершення при проведенні).
ALTER TABLE "mgr_reminders"
  ADD COLUMN IF NOT EXISTS "order_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mgr_reminders_order_id_fkey'
  ) THEN
    ALTER TABLE "mgr_reminders"
      ADD CONSTRAINT "mgr_reminders_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "mgr_reminders_order_id_idx"
  ON "mgr_reminders" ("order_id");

-- 3. Нове джерело нагадування: сайтове замовлення.
ALTER TYPE "mgr_reminder_source" ADD VALUE IF NOT EXISTS 'auto_site_order';
