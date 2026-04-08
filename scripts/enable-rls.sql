-- Enable Row-Level Security on all 19 tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- NOTE: Prisma uses the direct DATABASE_URL (service role), which bypasses RLS.
-- The site will continue working normally after enabling RLS.
-- RLS only blocks access via Supabase JS Client with the anon key.
--
-- After enabling RLS, you need to create policies to allow specific access.
-- Without policies, all access via the anon key will be denied (secure by default).

BEGIN;

-- Core catalog tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Customer and order tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Exchange rates
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Cart tables
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Chat and communication
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Shipping and payments
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Mobile-specific tables
ALTER TABLE video_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Sync log
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- Read-only policies for public catalog data (anon key access)
-- ═══════════════════════════════════════════════════════════════════════

-- Allow anyone to read catalog data (categories, products, images, lots, prices)
CREATE POLICY "Public read access to categories"
  ON categories FOR SELECT
  USING (true);

CREATE POLICY "Public read access to products"
  ON products FOR SELECT
  USING (true);

CREATE POLICY "Public read access to product_images"
  ON product_images FOR SELECT
  USING (true);

CREATE POLICY "Public read access to lots"
  ON lots FOR SELECT
  USING (true);

CREATE POLICY "Public read access to prices"
  ON prices FOR SELECT
  USING (true);

CREATE POLICY "Public read access to exchange_rates"
  ON exchange_rates FOR SELECT
  USING (true);

CREATE POLICY "Public read access to barcodes"
  ON barcodes FOR SELECT
  USING (true);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- Verification: check RLS status on all tables
-- ═══════════════════════════════════════════════════════════════════════

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'categories', 'products', 'product_images', 'lots', 'barcodes',
    'prices', 'customers', 'orders', 'order_items', 'exchange_rates',
    'carts', 'cart_items', 'chat_messages', 'shipments',
    'video_subscriptions', 'push_tokens', 'payments', 'favorites',
    'sync_log'
  )
ORDER BY tablename;
