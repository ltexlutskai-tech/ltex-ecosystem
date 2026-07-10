-- Порядок замовлень у маршрутному листі (послідовність маршруту).
ALTER TABLE "mgr_route_sheet_orders"
  ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- Бекфіл: наявні рядки нумеруємо в межах кожного маршрутного листа за id.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY route_sheet_id ORDER BY id) - 1 AS pos
  FROM "mgr_route_sheet_orders"
)
UPDATE "mgr_route_sheet_orders" m
SET "position" = o.pos
FROM ordered o
WHERE m.id = o.id;
