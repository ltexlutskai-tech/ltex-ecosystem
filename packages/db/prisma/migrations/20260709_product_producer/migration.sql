-- Session 7.2: Product.producer (Виробник, ← 1С «Производитель»). Additive.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "producer" TEXT;
