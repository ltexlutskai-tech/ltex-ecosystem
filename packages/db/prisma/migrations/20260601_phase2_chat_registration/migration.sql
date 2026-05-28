-- Чат-inbox Phase 2: реєстрація нового клієнта через бот за областю.
-- Підстава — docs/CHAT_INBOX_PLAN.md (рішення user: мапа область→торговий).
--
-- Усе additive + idempotent. Не торкаємось наявних колонок/таблиць крім додавання
-- двох нульових полів у `mgr_chat_conversations`. Зразок — 20260531_chat_inbox.

-- ─── enum chat_registration_step ───────────────────────────────────────────────
-- Стан реєстрації в межах розмови:
--   awaiting_phone  — нова розмова, чекаємо contact-share від клієнта
--   awaiting_region — phone отримано, але клієнта не знайдено → просимо область
--   completed       — клієнт прив'язаний (по phone або після реєстрації за областю)
--   unassigned      — клієнт зареєстрований, але регіон без менеджера → ручний розбір
DO $$ BEGIN
    CREATE TYPE "chat_registration_step" AS ENUM (
        'awaiting_phone',
        'awaiting_region',
        'completed',
        'unassigned'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_region_agents (мапа область→торговий) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_region_agents" (
    "id"          TEXT NOT NULL,
    "region"      TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_region_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_region_agents_region_key"
    ON "mgr_region_agents" ("region");
CREATE INDEX IF NOT EXISTS "mgr_region_agents_user_id_idx"
    ON "mgr_region_agents" ("user_id");

DO $$ BEGIN
    ALTER TABLE "mgr_region_agents" ADD CONSTRAINT "mgr_region_agents_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_chat_conversations — нові поля для state machine ──────────────────────
-- NULLABLE без DEFAULT: NULL = legacy розмова (створена до Phase 2) — у такій
-- registration не запускається (fallback на noop). Нова phone storage між
-- кроками `awaiting_phone` → `awaiting_region`.
ALTER TABLE "mgr_chat_conversations"
    ADD COLUMN IF NOT EXISTS "registration_step" "chat_registration_step";

ALTER TABLE "mgr_chat_conversations"
    ADD COLUMN IF NOT EXISTS "pending_phone" TEXT;
