-- Внутрішній месенджер (Етап 8) — закріплені повідомлення + індекс для пошуку.
-- Additive + idempotent.

ALTER TABLE "mgr_messenger_messages"
  ADD COLUMN IF NOT EXISTS "pinned_at" TIMESTAMP(3);

-- Прискорення пошуку по тексту в межах розмови (ILIKE) — індекс за розмовою.
CREATE INDEX IF NOT EXISTS "mgr_messenger_messages_conversation_id_pinned_at_idx"
  ON "mgr_messenger_messages" ("conversation_id", "pinned_at");
