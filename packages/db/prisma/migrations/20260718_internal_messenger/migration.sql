-- Внутрішній корпоративний месенджер (Етап 1) — спілкування співробітників
-- (User) між собою. Окреме від клієнтського чат-inbox (mgr_chat_*).
-- План: docs/INTERNAL_MESSENGER_PLAN.md. Усе additive + idempotent.
-- Зразок стилю — 20260531_chat_inbox.

-- ─── enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "messenger_conversation_type" AS ENUM ('direct', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "messenger_member_role" AS ENUM ('member', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "messenger_message_kind" AS ENUM ('text', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_messenger_conversations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_messenger_conversations" (
    "id"               TEXT NOT NULL,
    "type"             "messenger_conversation_type" NOT NULL DEFAULT 'direct',
    "title"            TEXT,
    "direct_key"       TEXT,
    "created_by_id"    TEXT,
    "last_message_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_messenger_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_messenger_conversations_direct_key_key"
    ON "mgr_messenger_conversations" ("direct_key");
CREATE INDEX IF NOT EXISTS "mgr_messenger_conversations_last_message_at_idx"
    ON "mgr_messenger_conversations" ("last_message_at" DESC);

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_conversations" ADD CONSTRAINT "mgr_messenger_conversations_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_messenger_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_messenger_members" (
    "id"               TEXT NOT NULL,
    "conversation_id"  TEXT NOT NULL,
    "user_id"          TEXT NOT NULL,
    "role"             "messenger_member_role" NOT NULL DEFAULT 'member',
    "last_read_at"     TIMESTAMP(3),
    "joined_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at"          TIMESTAMP(3),
    CONSTRAINT "mgr_messenger_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_messenger_members_conversation_id_user_id_key"
    ON "mgr_messenger_members" ("conversation_id", "user_id");
CREATE INDEX IF NOT EXISTS "mgr_messenger_members_user_id_idx"
    ON "mgr_messenger_members" ("user_id");

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_members" ADD CONSTRAINT "mgr_messenger_members_conversation_id_fkey"
        FOREIGN KEY ("conversation_id") REFERENCES "mgr_messenger_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_members" ADD CONSTRAINT "mgr_messenger_members_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── mgr_messenger_messages ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_messenger_messages" (
    "id"               TEXT NOT NULL,
    "conversation_id"  TEXT NOT NULL,
    "author_id"        TEXT,
    "kind"             "messenger_message_kind" NOT NULL DEFAULT 'text',
    "text"             TEXT NOT NULL,
    "edited_at"        TIMESTAMP(3),
    "deleted_at"       TIMESTAMP(3),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_messenger_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_messenger_messages_conversation_id_created_at_idx"
    ON "mgr_messenger_messages" ("conversation_id", "created_at");

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_messages" ADD CONSTRAINT "mgr_messenger_messages_conversation_id_fkey"
        FOREIGN KEY ("conversation_id") REFERENCES "mgr_messenger_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_messages" ADD CONSTRAINT "mgr_messenger_messages_author_id_fkey"
        FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
