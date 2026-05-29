-- Manager sync state (Session M3.3 — INBOUND polling)
-- Простий key/value store для збереження курсорів синхронізації (cursor
-- останнього успішного pull з 1С тощо). Передбачається мала кількість
-- ключів (поки лише `last_sync_cursor`); якщо в майбутньому виросте —
-- зміниться на окремі моделі.
--
-- Idempotent: усе обернуто IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "mgr_sync_state" (
  "key"        TEXT         NOT NULL,
  "value"      TEXT         NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mgr_sync_state_pkey" PRIMARY KEY ("key")
);
