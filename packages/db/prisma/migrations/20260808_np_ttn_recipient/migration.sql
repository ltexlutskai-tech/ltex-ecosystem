-- Nova Poshta + Checkbox, Фаза 1: дані отримувача ТТН на реалізації.
-- Additive, idempotent.

ALTER TABLE "mgr_sales"
  ADD COLUMN IF NOT EXISTS "np_recipient_name"  TEXT,
  ADD COLUMN IF NOT EXISTS "np_recipient_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "np_payer_type"      TEXT;
