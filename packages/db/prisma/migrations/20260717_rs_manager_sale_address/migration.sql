-- Відповідальний менеджер маршрутного листа (для розрахунку «своїх» броней).
ALTER TABLE "mgr_route_sheets"
  ADD COLUMN IF NOT EXISTS "manager_user_id" TEXT;

-- Адреса доставки реалізації (спосіб «Доставка»).
ALTER TABLE "mgr_sales"
  ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
