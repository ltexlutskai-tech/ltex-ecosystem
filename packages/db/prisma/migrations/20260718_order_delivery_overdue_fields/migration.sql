-- Поля доставки замовлення за способом (паритет з Реалізацією / блоком
-- «Маршрутний лист»): № відділення Нової Пошти, адреса доставки, ТТН.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "nova_poshta_branch" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_address" TEXT,
  ADD COLUMN IF NOT EXISTS "express_waybill" TEXT;

-- «Термін до протермінування» (днів від створення) для авто-нагадування.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "overdue_days" INTEGER;
