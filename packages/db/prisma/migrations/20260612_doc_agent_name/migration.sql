-- Історичний імпорт 5.4.6a: підпис торгового агента на документах (з 1С ТорговийАгент._Description).
-- Additive + idempotent (повторний прогон безпечний).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "agent_name" TEXT;
ALTER TABLE "mgr_sales" ADD COLUMN IF NOT EXISTS "agent_name" TEXT;
