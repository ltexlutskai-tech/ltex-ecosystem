-- Об'єднаний чат-inbox (Phase 1a, M1.8) — нові моделі поза наявним `chat_messages`.
-- ChatConversation = одна розмова з клієнтом у мессенджері (Telegram/Viber/...).
-- ChatInboxMessage = одне повідомлення у розмові (in/out).
-- Підстава — docs/CHAT_INBOX_PLAN.md (старт TG+Viber, обидва напрямки, авто-
-- прив'язка за номером). Усе additive + idempotent; стара таблиця `chat_messages`
-- (внутрішній чат магазину) НЕ чіпається. Зразок — 20260529_mgr_reminders_block.

-- ─── enums (lowercase значення, snake_case @@map) ─────────────────────────────
DO $$ BEGIN
    CREATE TYPE "chat_platform" AS ENUM ('telegram', 'viber', 'whatsapp', 'instagram');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "chat_direction" AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "chat_sender" AS ENUM ('client', 'manager', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_chat_conversations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_chat_conversations" (
    "id"                  TEXT NOT NULL,
    "platform"            "chat_platform" NOT NULL,
    "external_user_id"    TEXT NOT NULL,
    "external_user_name"  TEXT,
    "phone"               TEXT,
    "client_id"           TEXT,
    "agent_user_id"       TEXT,
    "status"              TEXT NOT NULL DEFAULT 'active',
    "unread_for_manager"  INTEGER NOT NULL DEFAULT 0,
    "last_message_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_chat_conversations_platform_external_user_id_key"
    ON "mgr_chat_conversations" ("platform", "external_user_id");
CREATE INDEX IF NOT EXISTS "mgr_chat_conversations_agent_user_id_last_message_at_idx"
    ON "mgr_chat_conversations" ("agent_user_id", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "mgr_chat_conversations_client_id_idx"
    ON "mgr_chat_conversations" ("client_id");
CREATE INDEX IF NOT EXISTS "mgr_chat_conversations_status_last_message_at_idx"
    ON "mgr_chat_conversations" ("status", "last_message_at" DESC);

DO $$ BEGIN
    ALTER TABLE "mgr_chat_conversations" ADD CONSTRAINT "mgr_chat_conversations_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "mgr_clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_chat_conversations" ADD CONSTRAINT "mgr_chat_conversations_agent_user_id_fkey"
        FOREIGN KEY ("agent_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_chat_inbox_messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_chat_inbox_messages" (
    "id"                   TEXT NOT NULL,
    "conversation_id"      TEXT NOT NULL,
    "direction"            "chat_direction" NOT NULL,
    "sender"               "chat_sender" NOT NULL,
    "text"                 TEXT NOT NULL,
    "media_url"            TEXT,
    "external_message_id"  TEXT,
    "author_user_id"       TEXT,
    "is_read"              BOOLEAN NOT NULL DEFAULT false,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mgr_chat_inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_chat_inbox_messages_conversation_id_created_at_idx"
    ON "mgr_chat_inbox_messages" ("conversation_id", "created_at");

DO $$ BEGIN
    ALTER TABLE "mgr_chat_inbox_messages" ADD CONSTRAINT "mgr_chat_inbox_messages_conversation_id_fkey"
        FOREIGN KEY ("conversation_id") REFERENCES "mgr_chat_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_chat_inbox_messages" ADD CONSTRAINT "mgr_chat_inbox_messages_author_user_id_fkey"
        FOREIGN KEY ("author_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
