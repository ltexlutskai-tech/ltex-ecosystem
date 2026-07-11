-- Внутрішній месенджер (Етап 3) — відповідь-цитата на повідомлення.
-- Additive: колонка reply_to_id + self-FK (SET NULL при видаленні цілі).

ALTER TABLE "mgr_messenger_messages"
  ADD COLUMN IF NOT EXISTS "reply_to_id" TEXT;

CREATE INDEX IF NOT EXISTS "mgr_messenger_messages_reply_to_id_idx"
  ON "mgr_messenger_messages" ("reply_to_id");

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_messages" ADD CONSTRAINT "mgr_messenger_messages_reply_to_id_fkey"
        FOREIGN KEY ("reply_to_id") REFERENCES "mgr_messenger_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
