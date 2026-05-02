-- Session 59: Product card redesign
-- 1) Product gains 4 nullable text attributes (gender / sizes / units-per-kg / unit-weight)
-- 2) OrderItem.lot_id becomes nullable so customers can place orders for a product
--    without picking a specific lot (manager picks a free lot later).
-- 3) CartItem.lot_id becomes nullable for the same reason; the @@unique([cartId, lotId])
--    constraint is dropped because NULL lot rows are dedup'd at app level by productId.

-- ─── Product attributes ─────────────────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN "gender"        TEXT;
ALTER TABLE "products" ADD COLUMN "sizes"         TEXT;
ALTER TABLE "products" ADD COLUMN "units_per_kg"  TEXT;
ALTER TABLE "products" ADD COLUMN "unit_weight"   TEXT;

-- ─── OrderItem: lot_id nullable ─────────────────────────────────────────────
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_lot_id_fkey";
ALTER TABLE "order_items" ALTER COLUMN "lot_id" DROP NOT NULL;
ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_lot_id_fkey"
    FOREIGN KEY ("lot_id") REFERENCES "lots"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── CartItem: lot_id nullable, drop composite unique ───────────────────────
ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_cartId_lotId_key";
ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_cart_id_lot_id_key";
DROP INDEX IF EXISTS "cart_items_cartId_lotId_key";
DROP INDEX IF EXISTS "cart_items_cart_id_lot_id_key";
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_lot_id_fkey";
ALTER TABLE "cart_items" ALTER COLUMN "lot_id" DROP NOT NULL;
ALTER TABLE "cart_items"
    ADD CONSTRAINT "cart_items_lot_id_fkey"
    FOREIGN KEY ("lot_id") REFERENCES "lots"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
