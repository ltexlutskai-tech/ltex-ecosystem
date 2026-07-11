-- Внутрішній месенджер (Етап 5) — реакції-emoji на повідомлення.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS "mgr_messenger_reactions" (
    "id"          TEXT NOT NULL,
    "message_id"  TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "emoji"       TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mgr_messenger_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_messenger_reactions_message_id_user_id_emoji_key"
    ON "mgr_messenger_reactions" ("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "mgr_messenger_reactions_message_id_idx"
    ON "mgr_messenger_reactions" ("message_id");

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_reactions" ADD CONSTRAINT "mgr_messenger_reactions_message_id_fkey"
        FOREIGN KEY ("message_id") REFERENCES "mgr_messenger_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_reactions" ADD CONSTRAINT "mgr_messenger_reactions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
