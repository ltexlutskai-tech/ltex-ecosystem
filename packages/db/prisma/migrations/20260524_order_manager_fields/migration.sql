-- Блок «Замовлення» — Етап 1 (additive manager fields на Order)
-- Усі поля nullable / з дефолтами, магазину не заважають.
--   price_type_id            — тип цін (id з довідника mgr_price_types; без жорсткого FK)
--   delivery_method          — спосіб доставки (delivery|post|pickup)
--   cash_on_delivery         — наложка (післяплата)
--   assigned_agent_user_id   — торговий агент, кому зараховано продаж
--   export_to_1c             — вивантажувати в 1С (дефолт true)
--   archived                 — проведено в 1С (ставиться при успішному обміні)
--   is_actual                — активне (актуальне) замовлення

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "price_type_id" TEXT;

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "delivery_method" TEXT;

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "cash_on_delivery" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "assigned_agent_user_id" TEXT;

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "export_to_1c" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "is_actual" BOOLEAN NOT NULL DEFAULT true;
