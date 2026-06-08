-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20260607_receiving_review_reminder                                       ║
-- ║                                                                          ║
-- ║ Нагадування admin/owner для перевірки поступлення warehouse (узгоджено  ║
-- ║ user 2026-06-05): при збереженні чернетки сторонньою роллю warehouse —  ║
-- ║ авто-створення MgrReminder для всіх активних admin/owner з посиланням   ║
-- ║ на документ.                                                             ║
-- ║                                                                          ║
-- ║ Зміни (усі additive idempotent):                                         ║
-- ║   1. enum mgr_reminder_source += 'auto_receiving_review'                 ║
-- ║   2. mgr_reminders.receiving_id (FK на receivings, set null on delete)   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
  ALTER TYPE "mgr_reminder_source" ADD VALUE IF NOT EXISTS 'auto_receiving_review';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "mgr_reminders"
  ADD COLUMN IF NOT EXISTS "receiving_id" TEXT;

CREATE INDEX IF NOT EXISTS "mgr_reminders_receiving_id_idx"
  ON "mgr_reminders" ("receiving_id");

DO $$ BEGIN
  ALTER TABLE "mgr_reminders" ADD CONSTRAINT "mgr_reminders_receiving_id_fkey"
    FOREIGN KEY ("receiving_id") REFERENCES "receivings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
