-- ============================================================================
-- Wave 1 schema migration — 3 new tables
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Creates: featured_products, banners, promo_stripe
-- Generated from: packages/db/prisma/schema.prisma (Prisma migrate diff)
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================================================

-- ─── featured_products (Task 4) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "featured_products" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "featured_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "featured_products_product_id_key"
    ON "featured_products"("product_id");

CREATE INDEX IF NOT EXISTS "featured_products_position_idx"
    ON "featured_products"("position");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'featured_products_product_id_fkey'
    ) THEN
        ALTER TABLE "featured_products"
            ADD CONSTRAINT "featured_products_product_id_fkey"
            FOREIGN KEY ("product_id") REFERENCES "products"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── banners (Task 3) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "banners_isActive_position_idx"
    ON "banners"("isActive", "position");

-- ─── promo_stripe (Task 7) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "promo_stripe" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "bgColor" TEXT NOT NULL DEFAULT '#dc2626',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_stripe_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Done. Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('featured_products', 'banners', 'promo_stripe');
-- ============================================================================
