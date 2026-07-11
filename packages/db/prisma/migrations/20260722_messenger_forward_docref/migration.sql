-- Внутрішній месенджер (Етап 6) — пересилання + посилання на документи системи.
-- Additive + idempotent.

ALTER TABLE "mgr_messenger_messages"
  ADD COLUMN IF NOT EXISTS "forwarded_from" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_ref" JSONB;
