-- Внутрішній месенджер (Етап 4) — вкладення повідомлень (фото + файли).
-- Additive + idempotent.

DO $$ BEGIN
    CREATE TYPE "messenger_attachment_kind" AS ENUM ('image', 'file');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "mgr_messenger_attachments" (
    "id"          TEXT NOT NULL,
    "message_id"  TEXT NOT NULL,
    "kind"        "messenger_attachment_kind" NOT NULL,
    "url"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "mime_type"   TEXT NOT NULL,
    "size_bytes"  INTEGER NOT NULL,
    "width"       INTEGER,
    "height"      INTEGER,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mgr_messenger_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_messenger_attachments_message_id_idx"
    ON "mgr_messenger_attachments" ("message_id");

DO $$ BEGIN
    ALTER TABLE "mgr_messenger_attachments" ADD CONSTRAINT "mgr_messenger_attachments_message_id_fkey"
        FOREIGN KEY ("message_id") REFERENCES "mgr_messenger_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
