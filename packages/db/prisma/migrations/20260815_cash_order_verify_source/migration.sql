-- NovaPay авто-звірка (Фаза 5): джерело касового ордера + звірка працівником
-- офісу (хто/коли підтвердив надходження на рахунок).

ALTER TABLE "mgr_cash_orders"
  ADD COLUMN IF NOT EXISTS "source"              TEXT,
  ADD COLUMN IF NOT EXISTS "verified_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verified_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "verified_by_name"    TEXT;
