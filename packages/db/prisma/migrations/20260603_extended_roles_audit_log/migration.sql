-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20260603_extended_roles_audit_log                                        ║
-- ║                                                                          ║
-- ║ Розширення ролей користувача + аудит-лог дій (← Тиждень 1 блоку Ролі).   ║
-- ║                                                                          ║
-- ║ 1. Додаємо 5 нових значень у enum "UserRole":                            ║
-- ║      owner / supervisor / analyst / warehouse / bookkeeper               ║
-- ║    Існуючі manager / senior_manager / admin залишаються без змін.        ║
-- ║                                                                          ║
-- ║ 2. Додаємо поле `users.permissions` JSONB (per-user override over роле-  ║
-- ║    дефолтів). NULL = використовуються дефолти ролі.                      ║
-- ║                                                                          ║
-- ║ 3. Створюємо `audit_logs` — універсальна таблиця подій. Кожна            ║
-- ║    мутаційна дія (POST/PATCH/DELETE) логує: хто/коли/звідки/що/before/   ║
-- ║    after-snapshot. Власник (owner) — особлива увага: усі його дії        ║
-- ║    логуються з isOwnerAction=true для швидкого фільтру в admin-UI.       ║
-- ║                                                                          ║
-- ║ Усі зміни — additive idempotent (можна повторно застосовувати).          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Розширити enum UserRole ─────────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'owner';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'supervisor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'analyst';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'warehouse';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'bookkeeper';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. users.permissions JSONB ─────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissions" JSONB;

-- ── 3. audit_logs (універсальна таблиця подій) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"               TEXT          NOT NULL,
  "user_id"          TEXT,
  "user_email"       TEXT,
  "user_role"        TEXT          NOT NULL,
  "action"           TEXT          NOT NULL,        -- create / update / delete / login / etc.
  "resource"         TEXT          NOT NULL,        -- order / client / lot / payment / etc.
  "resource_id"      TEXT,                          -- id-сутності (опц., якщо ресурс — список — null)
  "summary"          TEXT,                          -- людиночитна короткострочна підказка
  "data_before"      JSONB,                         -- snapshot ДО зміни (для update/delete)
  "data_after"       JSONB,                         -- snapshot ПІСЛЯ зміни (для create/update)
  "ip"               TEXT,
  "user_agent"       TEXT,
  "is_owner_action"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Soft-FK на users (set null коли user видалили — лог зберігається)
DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Індекси для типових запитів adm-UI
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"
  ON "audit_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx"
  ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx"
  ON "audit_logs" ("resource", "resource_id");
CREATE INDEX IF NOT EXISTS "audit_logs_owner_action_idx"
  ON "audit_logs" ("is_owner_action", "created_at" DESC)
  WHERE "is_owner_action" = TRUE;
