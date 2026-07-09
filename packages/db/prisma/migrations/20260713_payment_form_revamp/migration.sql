-- Правки блоку «Оплати»: напрям статей, тип рахунку, статус чернетки/проведення.

-- Напрям статті руху коштів: income | expense | both (дефолт both).
ALTER TABLE "mgr_cash_flow_articles"
  ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'both';

-- Тип банк. рахунку: account | card | cash (дефолт account). Класифікуємо
-- наявні за назвою: «каса» → cash, «карт» → card, решта лишаються account.
ALTER TABLE "mgr_bank_accounts"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'account';
UPDATE "mgr_bank_accounts" SET "kind" = 'cash' WHERE "name" ILIKE '%кас%';
UPDATE "mgr_bank_accounts" SET "kind" = 'card' WHERE "name" ILIKE '%карт%';

-- Статус касового ордера: draft | posted (дефолт posted — історичні проведені).
ALTER TABLE "mgr_cash_orders"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'posted';
